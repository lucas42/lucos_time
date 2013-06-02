var lucos = require("_lucos");
lucos.waitFor('ready', function _VidDOMReady() {
	
	// Don't load anything for pages opened in hidden iframes
	if (!window.innerHeight) return;
	
	// Add the clock whilst working out if there's vids etc available (sometimes takes a while)
	_showClock();
	
	lucos.detect.mediaElement(function _gotPlayer(type, player) {
		
		// Only add player on devices which support video and are online, otherwise keep boring clock
		if (type !== "video" || !lucos.detect.isOnline()) return;
		
		// Hide clock to make room for player
		_removeClock();
		player.id = 'timeVid';
		function _updateVid() {
			var date = new Date(Time.client() + Time.get());
			var hour = date.getHours();
			var min = Math.floor(date.getMinutes() / 10) * 10;
			var offset = (date.getMinutes() - min) * 60 + date.getSeconds();
			if (hour < 10) hour = '0' + hour;
			if (min < 10) min = '0' + min;
			
			var src = "/standardtime?hour="+hour+'&min='+min;
			if (player.getAttribute("src") == src) {
				if (player.paused) player.play();
				if (Math.abs(player.currentTime - offset) < 2) return;
				player.currentTime = offset;
			} else {
				player.src = src;
				player.play();
			}
			
		}
		
		// Run _updateVid at the end of one video to start the next one
		player.addEventListener("ended", _updateVid, false);
		
		// Also run on 'playing' so that currentTime can be ajusted to account for network lag etc.
		player.addEventListener("playing", _updateVid, false);
		player.addEventListener("timeupdate", _updateVid, false);
		
		// TODO: on error, revert to showing clock
		
		player.parentNode.style.backgroundColor = 'black';
		lucos.listen('offsetupdate', _updateVid, true);
		_updateVid();
		
		// Don't let page rubber band
		(function _addTouchHandlers() {
			document.body.addEventListener('touchmove', function(e){ e.preventDefault(); }, false);
		})();
	}, true);
});

var timeNode_timeout;
function _showClock() {
	var clock;
	if (!document.querySelector(".now")) return;
	if (clock) return;
	var clock = document.createElement("div");
	clock.id='clock';
	var hourHand = document.createElement("div");
	var minHand = document.createElement("div");
	var secHand = document.createElement("div");
	hourHand.id = 'hourHand';
	minHand.id = 'minHand';
	secHand.id = 'secHand';
	clock.appendChild(hourHand);
	clock.appendChild(minHand);
	clock.appendChild(secHand);
	document.body.appendChild(clock);
	function updateInlineTime(force) {
		if (timeNode_timeout) clearTimeout(timeNode_timeout);
		var date = new Date(Time.client() + Time.get(force));
		document.querySelector(".now").firstChild.nodeValue = date.toTimeString();
		var hourDeg = date.getHours() * 30;
		var minDeg = date.getMinutes() * 6;
		var secDeg = date.getSeconds() * 6;
		hourHand.style.webkitTransform = "rotate("+hourDeg+"deg)";
		minHand.style.webkitTransform = "rotate("+minDeg+"deg)";
		secHand.style.webkitTransform = "rotate("+secDeg+"deg)";
		
		
		timeNode_timeout=setTimeout(updateInlineTime, 1000-date.getMilliseconds());
	}
	updateInlineTime();
	document.querySelector(".now").addEventListener('click', function _timenodecolour() { this.style.color='red'; updateInlineTime(true); }, false);
	lucos.listen('offsetupdate', function _timenodecolour() { document.querySelector(".now").style.color=''; }, true);
}
function _removeClock() {
	clock = document.getElementById('clock');
	if (timeNode_timeout) clearTimeout(timeNode_timeout);
	if (clock) {
		clock.parentNode.removeChild(clock);
	}
}
