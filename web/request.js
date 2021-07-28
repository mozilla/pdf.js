function dynamicLoadJs(url, callback) {
  const head = document.getElementsByTagName("head")[0];
  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = url;
  if (typeof callback === "function") {
    script.onload = script.onreadystatechange = function () {
      if (
        !this.readyState ||
        this.readyState === "loaded" ||
        this.readyState === "complete"
      ) {
        callback();
        script.onload = script.onreadystatechange = null;
      }
    };
  }
  head.appendChild(script);
}

dynamicLoadJs("https://unpkg.com/axios/dist/axios.min.js", () => {
  axios.get("/api/bookmark").then(res => console.log(res));
});
