
var LG = (function (lg) {
	lg.jQuery = $;
	lg.Beat = function(soundName, imageName, duration) {
		this.soundName = soundName;
		this.imageName = imageName;
		this.duration = duration;
	};

	lg.Component = function(name, beats) {
		this.name = name;
		this.beats = beats;
	}

	lg.Tala = function(name, components) {
		this.name = name;
		this.components = components;
	};

	lg.Context = function() {
		this.audioContext = new AudioContext();
		this.soundGroups = {};
		this.imageGroups = {};
	};

	lg.Context.prototype.loadFrom = function(url, callback) {
		var context = this;
		lg.jQuery.get(url, function(result, status, xqHTR) {
			context.soundGroups = {};
			for (var groupName in result.SoundGroups) {
				context.soundGroups[groupName] = new lg.SoundGroup(groupName);
				var sounds = result.SoundGroups[groupName];
				for (var soundName in sounds) {
					var url = sounds[soundName];
					context.soundGroups[groupName].addSound(new lg.Sound(soundName, url));
				}
			}

			context.imageGroups = {};
			for (var groupName in result.ImageGroups) {
				context.imageGroups[groupName] = new lg.ImageGroup(groupName);
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
		this.soundGroups[name].load(this.audioContext, callback);
	};

	lg.Context.prototype.loadImageGroup = function(name, callback) {
		this.imageGroups[name].load(callback);
	};

	return lg;
}(LG || {}));

