import { getDatetime } from 'lucos_time_component';

// Add the clock whilst working out if there's vids etc available (sometimes takes a while)
showClock();
document.addEventListener('click', showPlayer);

const leadingZero = (num) => num.toString().padStart(2, '0');

function showPlayer() {
	const player = document.createElement("video");
	player.id = 'timeVid';
	function _updateVid() {
		const date = getDatetime();
		const hour = date.getHours();
		const min = Math.floor(date.getMinutes() / 10) * 10;
		const offset = (date.getMinutes() - min) * 60 + date.getSeconds();
		const src = window.MEDIAURL+`/big_${leadingZero(hour)}-${leadingZero(min)}.mp4`;
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


	document.body.appendChild(player);
	document.body.style.backgroundColor = 'black';
	_updateVid();

	// Don't let page rubber band
	(function _addTouchHandlers() {
		document.body.addEventListener('touchmove', function(e){ e.preventDefault(); }, false);
	})();

	document.removeEventListener('click', showPlayer);
}

var timeNode_timeout;
function showClock() {
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
	function updateInlineTime() {
		if (timeNode_timeout) clearTimeout(timeNode_timeout);
		var date = getDatetime();
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
}
function removeClock() {
	clock = document.getElementById('clock');
	if (timeNode_timeout) clearTimeout(timeNode_timeout);
	if (clock) {
		clock.parentNode.removeChild(clock);
	}
}
