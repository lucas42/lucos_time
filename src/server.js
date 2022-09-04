 import { promises as fs } from 'fs';
 import url from 'url';
 import querystring from 'querystring';
 import http from 'http';

const port = process.env.PORT || 8080;

// Media url is the url of a directory where the time videos are kept.  Each video is 10 minutes long and its file name is {MEDIAURL}/big_{hour}-{min}.mp4 (hour and min are two digit numbers and rounded to 10 minute intervals)
if (!process.env.MEDIAURL) {
	console.log("'MEDIAURL' environment variable not set");
	process.exit(1);
}

http.ServerResponse.prototype.sendError = function sendError(code, message, headers) {
	if (!headers) headers = {};
	if (!('Content-Type' in headers)) headers['Content-Type'] = 'text/html';
	this.writeHead(code, headers);
	this.write('<br/><strong>Error:</strong> '+message);
	this.end();
};


http.ServerResponse.prototype.sendFile = async function sendFile(filename, mimetype, modifications) {
	const res = this;
	try {
		let data = await fs.readFile(filename);
		if (typeof modifications == 'function') data = modifications.call(data);
		res.writeHead(200, {'Content-Type': mimetype || 'text/html' });
		res.write(data);
		res.end();
	} catch {
		res.sendError(500, 'File "'+filename+'" can\'t be read from disk');
	}
};
http.createServer(async (req, res) => {
	var cookies = {};
	var agentid = null;
	if (req.headers.cookie) {
		cookies = querystring.parse(req.headers.cookie, '; ');
	}
	var url_parts = url.parse(req.url, true);
	var path = url_parts.pathname;
	var params = url_parts.query;
	switch (path) {
		case "/icon.png":
			res.sendFile("resources/icon.png", "image/png");
			break;
		case "/client.js":
			res.sendFile("resources/client.js", "text/javascript");
			break;
		case "/style.css":
			res.sendFile("resources/style.css", "text/css");
			break;
		case "/now":
			res.writeHead(200, {'Content-Type': "application/json", 'Access-Control-Allow-Origin': "*"});
			res.write(JSON.stringify(new Date().getTime()));
			res.end();
			break;
		case "/":
			res.sendFile("index.xhtml", "application/xhtml+xml", function () {
				return this.toString()
					.replace("$now$", new Date().toTimeString())
					.replace("$mediaurl$", process.env.MEDIAURL);
			});
			break;
		case "/_info":
			const testurl = `${process.env.MEDIAURL}/big_00-00.mp4`;
			const output = {
				system: 'lucos_time',
				checks: {
					media: {
						techDetail: `Makes HEAD request for media file from url ${testurl}`
					}
				},
				metrics: {},
				ci: {
					circle: "gh/lucas42/lucos_time",
				},
			};
			try {
				const response = await fetch(testurl, {method: 'HEAD', timeout: 1000});
				if (response.status !== 200) throw new Error(`Server returned HTTP Status Code ${response.status}`);
				output.checks.media.ok = true;
			} catch (error) {
				output.checks.media.ok = false;
				output.checks.media.debug = error.message;
			}
			res.writeHead(200, {'Content-Type': 'application/json' });
			res.write(JSON.stringify(output));
			res.end();
			break;
		default:
			res.sendError(404, 'File Not Found');
	}
		
}).listen(port);
console.log('Server running at http://127.0.0.1:'+port+'/');
