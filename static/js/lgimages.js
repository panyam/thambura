
var LG = (function (lg) {
	lg.jQuery = lg.jQuery || $;
	lg.Image = function(name, url) {
		this.name = name;
		this.width = 0;
		this.height = 0;
		this.url = url;
		this.imageElement = null;
		this.state = null;
		this.error = null;
	};

	lg.Image.prototype.load = function(callback) {
		this.error = null;
		this.buffer = null;
		this.state = "loading";
		var image = this;
		lg.jQuery("<img src = '" + this.url + "'>").load(function() {
			image.imageElement = $(this);
			image.state = null;
			console.log("Loaded image: " + image.url);
			if (typeof(callback) !== "undefined" && callback != null) {
				callback(image);
			}
		});
	}

	lg.ImageGroup = function(name) {
		this.name = name;
		this.images = {};
	}

	lg.ImageGroup.prototype.addImage = function(image) {
		this.images[image.name] = image;
	};

	lg.ImageGroup.prototype.load = function(callback) {
		var numToLoad = Object.keys(this.images).length;
		var imageGroup = this;

		function invokeCallback(ntl, callback) {
			if (ntl == 0) {
				if (typeof(callback) !== "undefined" && callback != null) {
					callback(imageGroup, null);
				}
			}
		}

		for (var imageName in this.images) {
			var image = this.images[imageName];
			image.load(function(image) {
				numToLoad --;
				invokeCallback(numToLoad, callback);
			});
		}
	};

	return lg;
}(LG || {}));
