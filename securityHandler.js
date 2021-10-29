let applySecurity = app.trustedFunction(function () {
    let oMyPolicy = null;
    app.beginPriv();

    // Obtaining the ID of the Security Policy
    let aPols = security.getSecurityPolicies()
    for (let index = 0; index < aPols.length; index++) {
        if (aPols[index].name == "MySecurityPol") {
            oMyPolicy = aPols[index]; break;
        }
    }
    if (oMyPolicy == null) { app.alert("Policy Not Found"); return; }

    // Applying the security Policy
    let rtn = this.encryptUsingPolicy({ oPolicy: oMyPolicy });
    if (rtn.errorCode != 0) app.alert("Security Error: " + rtn.errorText); app.endPriv();
});