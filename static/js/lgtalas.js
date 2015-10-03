
var LG = (function (lg) {
	lg.jQuery = $;
	lg.Beat = function(totalDuration, imageName, sounds, offsets) {
		this.imageName = imageName;

		// Duration of this beat - as a factor of the BPM
		this.totalDuration = totalDuration;
		
		// The sounds and their corresponding offsets (as a factor of the BPM)
		this.sounds = sounds;
		this.offsets = offsets;
	};

	lg.BeatPlayer = function(context) {
		this.lgContext = context;
		this.generator = null;
		this.setTempo(80);
		this.playing = false;
	};

	lg.BeatPlayer.prototype.setTempo = function(bpm) {
		this.tempo = bpm;	// in beats per minute
		this.beatDuration = 60000.0 / bpm;
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
		var beat = player.generator.currentBeat();
		var lgContext = player.lgContext;
		var image = lgContext.currentImageGroup.getImage(beat.imageName);
		for (var i = 0;i < beat.sounds.length;i++)
		{
			var sound = lgContext.currentSoundGroup.getSound(beat.sounds[i]);
			var source = lgContext.audioContext.createBufferSource();
			source.buffer = soundbuffer;
			source.connect(lgContext.audioContext.destination);
			source.start(player.beatDuration * beat.offsets[i]);
		}
	}

	lg.BeatPlayer.prototype._nextStep = function() {
		if (this.playing) {
			var player = this;
			var beat = player.generator.currentBeat();
			var nextBeatDelay = beat.totalDuration * player.beatDuration;

			player.generator.forward();
			setTimeout(function() { player._nextStep(); }, nextBeatDelay);
		}
	};

	return lg;
}(LG || {}));

