var lucos = require("_lucos");
window.Time = (function () {
	var windowList = [];
	function clientTime() {
		return new Date().getTime();
	}
	function getTime(force) {
		function fetchNTP() {
			
			var fetching = localStorage.getItem('fetchingNTP');
			
			// If a fetch has been started in the last minute, then don't bother
			if (fetching && fetching > clientTime()-(60*1000)) return;
			localStorage.setItem('fetchingNTP', clientTime());
			
			var ii = 0;
			var o1, d1;
			
			function getOffset() {
				var t0, t1, t2, t3;
				var o0, d0;
				var wini, winl;
				lucos.net.rawget("/now", {'_cb' : clientTime()}, function response(req) {
					switch (req.readyState) {
						case 1: // opened
							t3 = clientTime();
							break;
						case 2: // headers received
							t0 = clientTime();
							break;
						case 4: // done
							t1 = t2 = parseInt(req.responseText); // assume the server replied instantaneously
							o0 = (t2 - t3 + t1 - t0) / 2; // estimate for the actual offset between two clocks
							d0 = t2 - t3 + t0 -t1; // total transmission time for the pair of messages
							if (typeof d1 === "undefined" || d0 < d1) { // replace existing offset if there is a more accurate one
								o1 = o0;
								d1 = d0;
							}
							if (++ii < 8) {
								
								// Try eight times to get the most accurate value
								getOffset();
							} else {
								
								// Save in local storage (savedat uses client time for consistency)
								localStorage.setItem('NTPOffset', JSON.stringify({'offset':o1, 'savedAt': clientTime()}));
								localStorage.removeItem('fetchingNTP');
								
								// Trigger events to let others know of update
								lucos.send('offsetupdate', {offset: o1, fresh: true });
								for (wini = 0, winl = windowList.length; wini<winl; wini++) {
									lucos.send('offsetupdate', {offset: o1, fresh: true }, windowList[wini]);
								}
							}
							break;
					}
				});
			}
			getOffset();
		}
		var savedOffset = localStorage.getItem('NTPOffset');
		
		// If the offset isn't saved, then request an update and just use client time.
		if (!savedOffset) {
			fetchNTP();
			return 0;
		}
		savedOffset = JSON.parse(savedOffset);
		
		// If the offset hasn't been updated in over an hour, request an update
		if (savedOffset.savedAt > clientTime() + (60 * 60 * 1000)) fetchNTP();
		else if (force) fetchNTP();
		return savedOffset.offset;
	}
	
	lucos.listen("time_offset", function (params, source) {
		var ii, ll, gotSource = false;
		for (ii = 0, ll = windowList.length; ii<ll; ii++) {
			if (windowList[ii] == source) {
				gotSource = true;
				break;
			}
		}
		if (!gotSource) windowList.push(source);
		lucos.send('offsetupdate', {offset: getTime(params.force), fresh: false }, source);
	});
	if (window != window.parent) lucos.send("api_ready", {methods: ["time_offset"]}, window.parent);
	return {
		client: clientTime,
		get: getTime
	};
})();
