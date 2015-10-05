

function setupLG() {
	lgPlayer.setGenerator(beatGenerator);
	lgContext.loadFrom("/static/Resources/TalasFixtures.json", function(context, error) {
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

		soundGroupChanged();
		imageGroupChanged();
	});
}

function setupControls() {
	$("#restartBeatButton").click(function() {
		lgPlayer.generator.restart();	
		lgPlayer.playCurrent();
	});

	$("#nextBeatButton").click(function() {
		if (!lgPlayer.isPlaying())
		{
			lgPlayer.generator.forward();
			lgPlayer.playCurrent();
		}
	});

	$("#prevBeatButton").click(function() {
		if (!lgPlayer.isPlaying())
		{
			lgPlayer.generator.backward();
			lgPlayer.playCurrent();
		}
	});

	$("#startStopButton").click(function() {
		if (!lgPlayer.isPlaying())
		{
			lgPlayer.startPlaying();
			$("#startStopButton").html("Stop");
		} else {
			lgPlayer.stopPlaying();
			$("#startStopButton").html("Start");
		}
	});
	setupTempoSlider();
    $( "#soundGroupsSelect" ).change(soundGroupChanged);
    $( "#imageGroupsSelect" ).change(imageGroupChanged);
}

function setupTempoSlider() {
	var sliderDiv = $("#tempoSlider").slider({
      min: LG.MIN_TEMPO,
      max: LG.MAX_TEMPO,
      range: "min",
      value: LG.DEFAULT_TEMPO,
      slide: function( event, ui ) {
		  setTempo(ui.value);
      }
    });
   	$("#tempoSlider").change(function() { setTempo(this.selectedIndex + 10); });
   	$("#tempoTextField").change(function() { setTempo($(this).val()); });
	setTempo(LG.DEFAULT_TEMPO);
}

function setTempo(tempo) {
	tempo = parseInt(tempo);
	if (isNaN(tempo))
		tempo = LG.DEFAULT_TEMPO;
	var tempoTextField=$("#tempoTextField");
   	tempoTextField.val(tempo);
	lgPlayer.setTempo(tempo);
	$("#tempoSlider").slider();
	$("#tempoSlider").slider("value", parseInt(tempo));
}

function soundGroupChanged() {
	var groupName = $("#soundGroupsSelect").val();
	lgContext.loadSoundGroup(groupName, function(soundGroup) {
	});
}

function imageGroupChanged() {
	var groupName = $("#imageGroupsSelect").val();
	lgContext.loadImageGroup(groupName, function(imageGroup) {
		beatImageContainer.html("");
		beatImageContainer.append(lgContext.imageGroups[groupName].images["down"].imageElement);
	});
}

