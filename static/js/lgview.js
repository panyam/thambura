
var LGView = (function (lgview) {
	lgview.jQuery = $;
	lgview.lgContext = null;
	lgview.beatImageContainer = null;
	lgview.lgPlayer = null;
	lgview.currentGenerator = null;

	lgview.initialize = function() {
		lgview._setupLG();
		lgview._setupControls();
		lgview.updateBeatGenerator();
	}

	lgview.setTempo = function(tempo) {
		tempo = parseInt(tempo);
		if (isNaN(tempo))
			tempo = LG.DEFAULT_TEMPO;
		var tempoTextField=$("#tempoTextField");
		tempoTextField.val(tempo);
		lgview.lgPlayer.setTempo(tempo);
		$("#tempoSlider").slider();
		$("#tempoSlider").slider("value", parseInt(tempo));
	}

	lgview._setupLG = function() {
		lgview.lgContext = new LG.Context();
		lgview.beatImageContainer = $("#beatImageContainer");
		lgview.lgPlayer = new LG.BeatPlayer(lgview.lgContext, lgview.beatImageContainer);
		lgview.lgContext.loadFrom("/static/Resources/TalasFixtures.json", function(context, error) {
			// load the sounds
			$("#soundGroupsSelect").empty();
			for (var groupName in context.soundGroups)
			{
				$("#soundGroupsSelect").append("<option value='" + groupName + "'>" + groupName + "</option>");
			}

			$("#imageGroupsSelect").empty();
			for (var groupName in context.imageGroups)
			{
				$("#imageGroupsSelect").append("<option value='" + groupName + "'>" + groupName + "</option>");
			}

			lgview._soundGroupChanged();
			lgview._imageGroupChanged();
		});
	}

	lgview._setupControls = function() {
		$("#restartBeatButton").click(function() {
			lgview.lgPlayer.generator.restart();	
			lgview.lgPlayer.playCurrent();
		});

		$("#nextBeatButton").click(function() {
			if (!lgview.lgPlayer.isPlaying())
			{
				lgview.lgPlayer.generator.forward();
				lgview.lgPlayer.playCurrent();
			}
		});

		$("#prevBeatButton").click(function() {
			if (!lgview.lgPlayer.isPlaying())
			{
				lgview.lgPlayer.generator.backward();
				lgview.lgPlayer.playCurrent();
			}
		});

		$("#startStopButton").click(function() {
			if (!lgview.lgPlayer.isPlaying())
			{
				lgview.lgPlayer.startPlaying();
				$("#startStopButton").html("Stop");
			} else {
				lgview.lgPlayer.stopPlaying();
				$("#startStopButton").html("Start");
			}
		});
		lgview._setupTempoSlider();
		$( "#soundGroupsSelect" ).change(lgview._soundGroupChanged);
		$( "#imageGroupsSelect" ).change(lgview._imageGroupChanged);

		// setup the thala, nadai, jaathi and kalai selectors
		$("#thaalaSelect").change(function() { lgview.updateBeatGenerator(); });
		$("#nadaiSelect").change(function() { lgview.updateBeatGenerator(); });
		$("#jaathiSelect").change(function() { lgview.updateBeatGenerator(); });
		$("#kalaiSelect").change(function() { lgview.updateBeatGenerator(); });
	}

	lgview._setupTempoSlider = function() {
		var sliderDiv = $("#tempoSlider").slider({
		  min: LG.MIN_TEMPO,
		  max: LG.MAX_TEMPO,
		  range: "min",
		  value: LG.DEFAULT_TEMPO,
		  slide: function( event, ui ) {
			  lgview.setTempo(ui.value);
		  }
		});
		$("#tempoSlider").change(function() { setTempo(this.selectedIndex + 10); });
		$("#tempoTextField").change(function() { setTempo($(this).val()); });
		lgview.setTempo(LG.DEFAULT_TEMPO);
	}

	lgview._soundGroupChanged = function() {
		var groupName = $("#soundGroupsSelect").val();
		lgview.lgContext.loadSoundGroup(groupName, function(soundGroup) {
		});
	}

	lgview._imageGroupChanged = function() {
		var groupName = $("#imageGroupsSelect").val();
		lgview.lgContext.loadImageGroup(groupName, function(imageGroup) {
			lgview.beatImageContainer.html("");
			lgview.beatImageContainer.append(lgview.lgContext.imageGroups[groupName].images["down"].imageElement);
		});
	}

	lgview.updateBeatGenerator = function() {
		var thaala = $("#thaalaSelect").val();
		var nadai = $("#nadaiSelect").val();
		var jaathi = $("#jaathiSelect").val();
		var kalai = parseInt($("#kalaiSelect").val());
		var config = { "jaathi": jaathi, "nadai": nadai };

		if (lgview.currentGenerator == null)
		{
			lgview.currentGenerator = new LG.SimpleBeatGenerator();
			lgview.lgPlayer.setGenerator(lgview.currentGenerator);
		}
		lgview.currentGenerator.setRepeatCount(kalai);

		// given the thala - pick the "template" of beats
		// with the nadai - only apply to sapta thalas and custom ones
		// jaathi - only is applied to laghu component
		// kalai - applies to all thals with more than one beat
		var beatList = null;
		if (thaala.startsWith("sapta_"))
		{
			thaala = thaala.substring("sapta_".length);
			beatList = LGCarnatic.generateTalaBeats(thaala, config);
		}
		else if (thaala.startsWith("chaapu_"))
		{
			thaala = thaala.substring("chaapu_".length);
			beatList = LGCarnatic.generateAngaBeats(thaala, true, config);
		}

		if (beatList != null)
		{
			lgview.currentGenerator.setBeatList(beatList);
		}
	}

	return lgview;
}(LGView || {}));


