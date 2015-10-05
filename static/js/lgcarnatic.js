
var LGCarnatic = (function (lgc) {
	lgc.jQuery = $;

	lgc.EKA_THAALAM = "eka";
	lgc.RUPAKA_THAALAM = "rupaka";
	lgc.MATYA_THAALAM = "matya";
    lgc.DHRUVA_THAALAM = "dhruva";
    lgc.JHUMPA_THAALAM = "jhumpa";
    lgc.THRIPUTA_THAALAM = "thriputa";
    lgc.ATA_THAALAM = "ata";
	lgc.ADI_THAALAM = "adi";
	lgc.SHORT_RUPAKA_THAALAM = "short_rupakam";

	lgc.LAGHU = "laghu";
	lgc.DHRUTHAM = "dhrutham";
	lgc.ANUDHRUTHAM = "anudhrutham";
	lgc.PLUTHAM = "plutham";
	lgc.GURU = "guru";
	lgc.KAKAPADAM = "kkpaadam";

	lgc.THISRAM = "thisram";
	lgc.CHATUSRAM = "chatusram";
	lgc.KHANDAM = "khandam";
	lgc.MISRAM = "misram";
	lgc.VILOMAM = "vilomam";
	lgc.SANKEERNAM = "sankeernam";

	lgc.tickOffsets = {};
	lgc.jaathiCounts = {};
	lgc.chaapuDurations = {};
	lgc.angaTemplates = {};
	lgc.talaTemplates = {};

	function initialize() {
		lgc.tickOffsets[lgc.THISRAM] = [ 0, 1/3 ];
		lgc.tickOffsets[lgc.CHATUSRAM] = [ 0 ];
		lgc.tickOffsets[lgc.KHANDAM] = [ 0, 2/5, 3/5 ];
		lgc.tickOffsets[lgc.MISRAM] = [ 0, 1/7, 3/7, 5/7 ];
		lgc.tickOffsets[lgc.VILOMAM] = [ 0, 2/7, 3/7, 5/7 ];
		lgc.tickOffsets[lgc.SANKEERNAM] = [ 0, 2/9, 4/9, 6/9, 7/9 ];

		lgc.chaapuDurations[lgc.THISRAM] = 3 / 2;
		lgc.chaapuDurations[lgc.CHATUSRAM] = 2 / 2;
		lgc.chaapuDurations[lgc.KHANDAM] = 5 / 2;
		lgc.chaapuDurations[lgc.MISRAM] = 7 / 2;
		lgc.chaapuDurations[lgc.VILOMAM] = 7 / 2;
		lgc.chaapuDurations[lgc.SANKEERNAM] = 9 / 2;

		lgc.jaathiCounts[lgc.THISRAM] = 3;
		lgc.jaathiCounts[lgc.CHATUSRAM] = 4;
		lgc.jaathiCounts[lgc.KHANDAM] = 5;
		lgc.jaathiCounts[lgc.MISRAM] = 7;
		lgc.jaathiCounts[lgc.VILOMAM] = 7;
		lgc.jaathiCounts[lgc.SANKEERNAM] = 9;

		lgc.angaTemplates[lgc.DHRUTHAM] = ["down", "open"];
		lgc.angaTemplates[lgc.ANUDHRUTHAM] = ["down"];
		lgc.angaTemplates[lgc.GURU] = ["guru_1", "guru_2", "guru_3", "guru_4",
                       				   "guru_5", "guru_6", "guru_7", "guru_8"];
        lgc.angaTemplates[lgc.PLUTHAM] = [ "plutam_1", "plutam_2", "plutam_3", "plutam_4",
										   "plutam_5", "plutam_6", "plutam_7", "plutam_8",
										   "plutam_9", "plutam_10", "plutam_11", "plutam_12"];
        lgc.angaTemplates[lgc.KAKAPADAM] =[	"kkpdm_1", "kkpdm_2", "kkpdm_3", "kkpdm_4",
											"kkpdm_5", "kkpdm_6", "kkpdm_7", "kkpdm_8",
											"kkpdm_9", "kkpdm_10", "kkpdm_11", "kkpdm_12",
											"kkpdm_13", "kkpdm_14", "kkpdm_15", "kkpdm_16"];

		lgc.talaTemplates[lgc.EKA_THAALAM] = [lgc.LAGHU];
		lgc.talaTemplates[lgc.RUPAKA_THAALAM] = [lgc.DHRUTHAM, lgc.LAGHU];
		lgc.talaTemplates[lgc.MATYA_THAALAM] = [lgc.LAGHU, lgc.DHRUTHAM, lgc.LAGHU];
        lgc.talaTemplates[lgc.DHRUVA_THAALAM] = [ lgc.LAGHU, lgc.DHRUTHAM, lgc.LAGHU, lgc.LAGHU ];
        lgc.talaTemplates[lgc.JHUMPA_THAALAM] = [ lgc.LAGHU, lgc.ANUDHRUTHAM, lgc.DHRUTHAM ];
        lgc.talaTemplates[lgc.THRIPUTA_THAALAM] = [ lgc.LAGHU, lgc.DHRUTHAM, lgc.DHRUTHAM ];
        lgc.talaTemplates[lgc.ATA_THAALAM] = [ lgc.LAGHU, lgc.LAGHU, lgc.DHRUTHAM, lgc.DHRUTHAM ];
        lgc.talaTemplates[lgc.ADI_THAALAM] = [ lgc.LAGHU, lgc.DHRUTHAM, lgc.DHRUTHAM ];
        lgc.talaTemplates[lgc.SHORT_RUPAKA_THAALAM] = [ lgc.ANUDHRUTHAM, lgc.DHRUTHAM ];
	}

	function beatWithType(sound, beatType, duration) {
		duration = duration || 1;
		var ticks = lgc.tickOffsets[beatType];
		return LG.processBeatEntry({
				"name": sound, "duration": duration,
				"ticks": ticks.map(function(tick, index) {
					return {"sound": sound, "offset": tick};
				})
		});
	}

	lgc.generateLaghuBeats = function(count, nadai, duration) {
		duration = duration || 1;
		var beatList = [];
		// first is always a down
		beatList.push(beatWithType("down", nadai, duration));

		// followed by:
		var fingers = [ "one", "two", "three", "four", "five" ];
		for (var i = 1;i < count;i++)
		{
			var sound = fingers[(i - 1) % fingers.length];
			beatList.push(beatWithType(sound, nadai, duration));
		}
		return beatList;
	};

	lgc.generateNonLaghuBeats = function(anga, nadai, duration) {
		var template = lgc.angaTemplates[anga];
		var beatList = template.map(function(sound, index) {
			return beatWithType(sound, nadai, duration);
		});
		return beatList;
	};

	lgc.generateAngaBeats = function(name, isChaapu, config) {
		if (isChaapu)
		{
			return beatWithTicks("down", lgc.tickOffsets[name], lgc.chaapuDurations[name]);
		} else {
			var jaathi = config.jaathi || lgc.CHATUSRAM;
			var count = lgc.jaathiCounts[jaathi];
			var nadai = config.nadai || lgc.CHATUSRAM;
			if (name === lgc.LAGHU)
			{
				return lgc.generateLaghuBeats(count, nadai);
			} else {
				return lgc.generateNonLaghuBeats(name, nadai);
			}
		}
	}

	lgc.generateTalaBeats = function(name, config) {
		var beatList = [];
		var talaTemplate = lgc.talaTemplates[name];
		talaTemplate.forEach(function(anganame, index) {
			var beats = lgc.generateAngaBeats(anganame, false, config);
			beatList = beatList.concat(beats);
		});
		return beatList;
	}

	initialize();
	return lgc;
}(LGCarnatic || {}));

