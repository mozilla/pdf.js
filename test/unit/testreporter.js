const TestReporter = function (browser) {
  function send(action, json) {
    return new Promise(resolve => {
      json.browser = browser;

      fetch(action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(json),
      })
        .then(response => {
          // Retry until successful.
          if (!response.ok || response.status !== 200) {
            throw new Error(response.statusText);
          }
          resolve();
        })
        .catch(reason => {
          console.warn(`TestReporter - send failed (${action}): ${reason}`);
          resolve();

          send(action, json);
        });
    });
  }

  function sendInfo(message) {
    send("/info", { message });
  }

  function sendResult(status, description, error) {
    const message = {
      status,
      description,
    };
    if (error !== undefined) {
      message.error = error;
    }
    send("/submit_task_results", message);
  }

  function sendQuitRequest() {
    send(`/tellMeToQuit?browser=${escape(browser)}`, {});
  }

  this.now = function () {
    return Date.now();
  };

  this.jasmineStarted = function (suiteInfo) {
    this.runnerStartTime = this.now();

    const total = suiteInfo.totalSpecsDefined;
    const seed = suiteInfo.order.seed;
    sendInfo(`Started ${total} tests for ${browser} with seed ${seed}.`);
  };

  this.suiteStarted = function (result) {
    // Normally suite starts don't have to be reported because the individual
    // specs inside them are reported, but it can happen that the suite cannot
    // start, for instance due to an uncaught exception in `beforeEach`. This
    // is problematic because the specs inside the suite will never be found
    // and run, so if we don't report the suite start failure here it would be
    // ignored silently, leading to passing tests even though some did not run.
    if (result.failedExpectations.length > 0) {
      let failedMessages = "";
      for (const item of result.failedExpectations) {
        failedMessages += `${item.message} `;
      }
      sendResult("TEST-UNEXPECTED-FAIL", result.description, failedMessages);
    }
  };

  this.specStarted = function (result) {};

  this.specDone = function (result) {
    if (result.failedExpectations.length === 0) {
      sendResult("TEST-PASSED", result.description);
    } else {
      let failedMessages = "";
      for (const item of result.failedExpectations) {
        failedMessages += `${item.message} `;
      }
      sendResult("TEST-UNEXPECTED-FAIL", result.description, failedMessages);
    }
  };

  this.suiteDone = function (result) {};

  this.jasmineDone = function () {
    // Give the test runner some time process any queued requests.
    setTimeout(sendQuitRequest, 500);
  };
};

export { TestReporter };
