var fs = require('fs')
   url = require('url'),
   querystring = require('querystring'),
   sys = require('sys'),
   http = require('http'),
   resources = require('../core/resources.js');

/* Add the resource files used on the client */
resources.add('js', 'js', 'time.js');
resources.add('video', 'js', 'video.js');
resources.add('css', 'css', 'style.css');

var port = parseInt(process.argv[2], 10);
if (isNaN(port) || port <= 0) {
	sys.puts("Usage: nodejs server.js port \n");
	sys.puts("Error: Valid port not specified\n\n");
	process.exit(1);
}

try {
	var configdata = fs.readFileSync('config');
	var config = JSON.parse(configdata);
} catch (e) {
	sys.puts("Problem reading config data: "+e);
	process.exit(2);
}

// Media url is the url of a directory where the time videos are kept.  Each video is 10 minutes long and its file name is {mediaurl}/big_{hour}-{min}.mp4 (hour and min are two digit numbers and rounded to 10 minute intervals)
if (!config.mediaurl) {
	sys.puts("'mediaurl' not found in config");
	process.exit(3);
}

http.ServerResponse.prototype.sendError = function sendError(code, message, headers) {
	if (!headers) headers = {};
	if (!('Content-Type' in headers)) headers['Content-Type'] = 'text/html';
	this.writeHead(code, headers);
	this.write('<br/><strong>Error:</strong> '+message);
	this.end();
};


http.ServerResponse.prototype.sendFile = function sendFile(filename, mimetype, modifications) {
	var res = this;
	fs.readFile(filename, function(err, data) {
		if (err) res.sendError(500, 'File "'+filename+'" can\'t be read from disk');
		else {
			if (typeof modifications == 'function') data = modifications.call(data);
			res.writeHead(200, {'Content-Type': mimetype || 'text/html' });
			res.write(data);
			res.end();
		}
	});
};
http.createServer(function _handleRequest(req, res) {
	var cookies = {};
	var agentid = null;
	if (req.headers.cookie) {
		cookies = querystring.parse(req.headers.cookie, '; ');
	}
	var url_parts = url.parse(req.url, true);
	var path = url_parts.pathname;
	var params = url_parts.query;
	switch (path) {
		case "/time.manifest":
			res.sendFile("manifest", "text/cache-manifest", function () {
					return this.toString()
						.replace("$mediaurl$", config.mediaurl);
				});
			break;
		case "/favicon.ico":
			res.sendFile("favicon.ico", "image/png");
			break;
		case "/icon":
			res.sendFile("icon.png", "image/png");
			break;
		case "/now":
			res.writeHead(200, {'Content-Type': "application/json"});
			res.write(JSON.stringify(new Date().getTime()));
			res.end();
			break;
		case "/":
			fs.readFile('../core/bootloader.js', function _gotbootloader(err, bootloader) {
				res.sendFile("index.xhtml", "application/xhtml+xml", function () {
					return this.toString()
						.replace("$now$", new Date().toTimeString())
						.replace("$bootloader$", bootloader.toString());
				});
			});
			break;
		case "/resources":
			resources.load(res, params.v);
			break;
		case "/preload":
			res.sendFile("../core/preload.xhtml", "application/xhtml+xml", function () {
					return this.toString()
						.replace("$manifest$", "/time.manifest");
				});
			break;
		case "/standardtime":
			var hour = parseInt(params.hour);
			var min = parseInt(params.min);
			if (isNaN(hour) || hour < 0 || hour >= 24 || isNaN(min) || min < 0 || min >= 60 || min % 10) {
				res.sendError(404, 'File Not Found');
			} else {
				if (hour < 10) hour = '0' + hour;
				if (min < 10) min = '0' + min;
                                res.writeHead(302, {'Location': config.mediaurl+"/big_"+hour+"-"+min+".mp4"});
                                res.end();

			}
			break;
		default:
			res.sendError(404, 'File Not Found');
	}
		
}).listen(port);
sys.puts('Server running at http://127.0.0.1:'+port+'/');
