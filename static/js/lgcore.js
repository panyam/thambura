var LG = (function (lg) {
	lg.MIN_TEMPO = 10;
	lg.MAX_TEMPO = 300;
	lg.DEFAULT_TEMPO = 80;

	lg.jQuery = $;
	lg.processBeatEntry = function(entry) {
		// plain beat as a string of duration 1
		var totalDuration = 1.0;
		var imageName = entry;
		var ticks = [new lg.Tick(entry, 0)];
		if (typeof(entry) !== "string")
		{
			// we have an object that can be of the following forms:
			//  {'name': 'name of the beat, eg down, open etc',
			//   'duration': 'total duration of the beat as a factor of the player beat duration - defaults to 1',
			//   'ticks': [ list of sounds to be played as
			//   			{'name': <name of sound>,
			//   			 'offset': the offset at which the sound is to be played 
			//   			  		   either as a fraction string or as a floating
			//   			  		   point value (less than the above duration) }]
			//   }
			imageName = entry["name"] || "down";
			totalDuration = entry["duration"] || 1.0;
			if (!lg.Utils.isNull(entry["ticks"])) {
				ticks = entry["ticks"].map(function(tick, index) {
					var sound = tick["sound"] || imageName;
					var offset = lg.Utils.parseNumber(tick["offset"]);
					return new lg.Tick(sound, offset);
				});
			}
		}
		return new lg.Beat(totalDuration, imageName, ticks);
	};

	lg.Tick = function(sound, offset) {
		this.sound = sound;
		this.offset = offset;
	}

	lg.Beat = function(totalDuration, imageName, ticks) {
		this.imageName = imageName;

		// Duration of this beat - as a factor of the BPM
		this.totalDuration = totalDuration;
		
		// The sounds and their corresponding offsets (as a factor of the BPM)
		this.ticks = ticks;
	};

	lg.SimpleBeatGenerator = function(beatList) {
		this.setBeatList(beatList);
	};

	lg.SimpleBeatGenerator.prototype.setBeatList = function(beatList) {
		this.beatList = [];
		for (var i = 0;i < beatList.length;i++)
		{
			var newBeat = lg.processBeatEntry(beatList[i]);
			this.beatList.push(newBeat);
		}
		this.currentIndex = 0;
	}

	lg.SimpleBeatGenerator.prototype.setBeatAt = function(beatConfig, index) {
		this.beatList[index] = lg.processBeatEntry(beatbeatConfig);
	}

	lg.SimpleBeatGenerator.prototype.forward = function() {
		this.currentIndex = (this.currentIndex + 1) % this.beatList.length;
	}

	lg.SimpleBeatGenerator.prototype.restart = function() {
		this.currentIndex = 0;
	};

	lg.SimpleBeatGenerator.prototype.backward = function() {
		this.currentIndex--;
		if (this.currentIndex < 0)
			this.currentIndex += this.beatList.length;
	};

	lg.SimpleBeatGenerator.prototype.currentBeat = function() {
		return this.beatList[this.currentIndex];
	};

	lg.BeatPlayer = function(context, imageContainer) {
		this.lgContext = context;
		this.imageContainer = imageContainer;
		this.generator = null;
		this.setTempo(lg.DEFAULT_TEMPO);
		this.playing = false;
	}

	lg.BeatPlayer.prototype.setGenerator = function(generator) {
		this.stopPlaying();
		this.generator = generator;
		if (generator != null)
			generator.restart();
	};

	lg.BeatPlayer.prototype.setTempo = function(bpm) {
		this.tempo = bpm;	// in beats per minute
		this.beatDuration = 60.0 / bpm;
	};

	lg.BeatPlayer.prototype.isPlaying = function() {
		return this.playing;
	};

	lg.BeatPlayer.prototype.startPlaying = function() {
		this.playing = true;
		this._nextStep();
	}

	lg.BeatPlayer.prototype.stopPlaying = function() {
		this.playing = false;
	};

	lg.BeatPlayer.prototype.playCurrent = function() {
		var player = this;
		if (!player.generator) return;
		var beat = player.generator.currentBeat();
		var lgContext = player.lgContext;
		var image = lgContext.currentImageGroup.getImage(beat.imageName);
		this.imageContainer.html("");
		this.imageContainer.append(image.imageElement);
		var totalDuration = player.beatDuration * beat.totalDuration;
		for (var i = 0;i < beat.ticks.length;i++)
		{
			var tick = beat.ticks[i];
			var sound = lgContext.currentSoundGroup.getSound(tick.sound);
			var source = lgContext.audioContext.createBufferSource();
			source.buffer = sound.buffer;
			source.connect(lgContext.audioContext.destination);
			source.start(lgContext.audioContext.currentTime + (tick.offset * totalDuration));
		}
	}

	lg.BeatPlayer.prototype._nextStep = function() {
		if (this.playing && this.generator != null) {
			var player = this;
			var beat = player.generator.currentBeat();
			player.playCurrent();
			var nextBeatDelay = beat.totalDuration * player.beatDuration * 1000;

			player.generator.forward();
			setTimeout(function() { player._nextStep(); }, nextBeatDelay);
		}
	};

	return lg;
}(LG || {}));

LG.Utils = (function (lgutils) {
	lgutils.jQuery = $;
	lgutils.isNull = function(obj) {
		return typeof(obj) === "undefined" || obj === null;
	}

	lgutils.parseNumber = function(value) {
		var num = value || 0;
		if (typeof(num) === "string")
		{
			var slashPos = num.indexOf("/");
			if (slashPos == -1)
			{
				num = parseFloat(num)
				if (isNaN(num)) 
				{
					num = 0;
				}
			} else {
				var numerator = num.substring(0, slashPos);
				var denominator = num.substring(slashPos + 1);
				if (isNan(numerator))
					numerator = 0;
				if (isNan(denominator))
					denominator = 1;
				num = numerator / denominator;
			}
		}
		return num;
	};
	return lgutils;
}(LG.Utils || {}));

