
var LG = (function (lg) {
	lg.jQuery = $;
	lg.Context = function() {
		if('webkitAudioContext' in window) {
			this.audioContext = new webkitAudioContext();
		} else {
			this.audioContext = new AudioContext();
		}
		this.gainNode = this.audioContext.createGain();
		// Connect gain node to destination
		this.gainNode.connect(this.audioContext.destination);
		this.soundGroups = {};
		this.imageGroups = {};
		this.currentSoundGroup = null;
		this.currentImageGroup = null;
	};

	lg.Context.prototype.loadFrom = function(url, callback) {
		var context = this;
		lg.jQuery.get(url, function(result, status, xqHTR) {
			if (typeof(result) === "string")
				result = JSON.parse(result);
			context.soundGroups = {};
			for (var groupName in result.SoundGroups) {
				context.soundGroups[groupName] = new lg.SoundGroup(groupName, context);
				var sounds = result.SoundGroups[groupName];
				for (var soundName in sounds) {
					var url = sounds[soundName];
					context.soundGroups[groupName].addSound(new lg.Sound(soundName, url));
				}
			}

			context.imageGroups = {};
			for (var groupName in result.ImageGroups) {
				context.imageGroups[groupName] = new lg.ImageGroup(groupName, context);
				var images = result.ImageGroups[groupName];
				for (var imageName in images) {
					var url = images[imageName];
					context.imageGroups[groupName].addImage(new lg.Image(imageName, url));
				}
			}

			if (typeof(callback) !== "undefined" && callback != null)
			{
				callback(context, null);
			}
		}).fail(function(response, status, msg) {
			alert("Context load failed: " + arguments);
			if (typeof(callback) !== "undefined" && callback != null)
			{
				callback(context, msg);
			}
		});
	};

	lg.Context.prototype.loadSoundGroup = function(name, callback) {
		this.currentSoundGroup = this.soundGroups[name];
		this.currentSoundGroup.load(this.audioContext, callback);
	};

	lg.Context.prototype.loadImageGroup = function(name, callback) {
		this.currentImageGroup = this.imageGroups[name]
		this.currentImageGroup.load(callback);
	};

	lg.Context.prototype.setVolume = function(value) {
		value = value / 100;
		// Let's use an x*x curve (x-squared) since simple linear (x) does not
		// sound as good.
		this.gainNode.gain.value = value * value;
	}

	return lg;
}(LG || {}));
