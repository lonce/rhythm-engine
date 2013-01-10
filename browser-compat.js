package('org.anclab.steller.browser-compat', function () {
    // Doesn't "provide" anything, but adds browser compatibiity stuff.
    // Of course, this is useful only within a browser.
    var initCompleted = false;
    var global = window;

    function init() {
        if (initCompleted) { return; }

        // Check requirements
        if (!global.localStorage 
            || !(global.requestFileSystem || global.webkitRequestFileSystem)
            || !(global.StorageInfo || global.webkitStorageInfo)) {
                alert("Please use the latest version of a modern browser like Chrome.");
                throw false;
            }

        if (!global.AudioContext && !global.webkitAudioContext) {
            alert("Needs latest version of Chrome for the Web Audio API.");
            throw false;
        }

        // Compatibility modifications.
        global.requestFileSystem = global.requestFileSystem || global.webkitRequestFileSystem;
        global.AudioContext = global.AudioContext || global.webkitAudioContext;
        global.StorageInfo = global.StorageInfo || global.webkitStorageInfo;
        global.BlobBuilder = global.BlobBuilder || global.WebKitBlobBuilder;
        global.URL = global.URL || global.webkitURL;

        initCompleted = true;
    }

    init();
    return global;
});
