
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
	var minTempo = 10;
	var maxTempo = 300;
	setTempo(80);
	var sliderDiv = $("#tempoSlider").slider({
      min: minTempo,
      max: maxTempo,
      range: "min",
      value: 80,
      slide: function( event, ui ) {
		  setTempo(ui.value);
      }
    });
    $( "#tempoSlider" ).change(function() {
		setTempo(this.selectedIndex + 10);
    });
}

function setTempo(tempo) {
	var tempoLabel=$("#tempoLabel");
   	tempoLabel.html(tempo + " bpm");
	lgPlayer.setTempo(tempo);
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

