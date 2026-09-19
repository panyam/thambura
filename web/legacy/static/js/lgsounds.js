
var LG = (function (lg) {
	lg.jQuery = lg.jQuery || $;
	lg.Sound = function(name, url) {
		this.name = name;
		this.url = url;
		this.state = null;
		this.error = null;
		this.buffer = null;
	};

	lg.Sound.prototype.load = function(audioContext, callback) {
		this.error = null;
		this.buffer = null;
		this.state = "loading";
		var theSound = this;
		var request = new XMLHttpRequest();
		request.open("GET", this.url);
		request.responseType = "arraybuffer";
		request.onload = function() {
			audioContext.decodeAudioData(request.response, function(buffer) {
				this.state = null;
				if (!buffer) {
					theSound.error = "Error decoding file data";
				} else {
					this.state = "loaded";
					theSound.buffer = buffer;
				}
				if (typeof(callback) !== "undefined" && callback != null) {
					callback(theSound);
				}
			});
		};
		request.onerror = function() {
			theSound.error = "request error";
			theSound.state = null;
			if (typeof(callback) !== "undefined" && callback != null) {
				callback(theSound);
			}
		};
		request.send();
	}

	lg.SoundGroup = function(name, context) {
		this.name = name;
        this.lgContext = context;
		this.sounds = {};
	}

	lg.SoundGroup.prototype.getSound = function(name) {
        if (this.name == "SaRiGaMa") { 
            var keys = Object.keys(this.sounds);
            var index = Math.floor(this.lgContext.currentRandom * keys.length);
            return this.sounds[keys[index]];
        } else {
		    return this.sounds[name] || null;
        }
	};

	lg.SoundGroup.prototype.addSound = function(sound) {
		this.sounds[sound.name] = sound;
	};

	lg.SoundGroup.prototype.load = function(audioContext, callback) {
		var numToLoad = Object.keys(this.sounds).length;
		var soundGroup = this;

		function invokeCallback(ntl, callback) {
			if (ntl == 0) {
				if (typeof(callback) !== "undefined" && callback != null) {
					callback(soundGroup, null);
				}
			}
		}

		for (var soundName in this.sounds) {
			var sound = this.sounds[soundName];
			sound.load(audioContext, function(sound) {
				numToLoad --;
				invokeCallback(numToLoad, callback);
			});
		}
	};

	return lg;
}(LG || {}));
