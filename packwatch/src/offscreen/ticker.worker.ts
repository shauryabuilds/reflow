// Worker timers are not throttled when the offscreen document is hidden.
setInterval(() => postMessage("tick"), 1000);
