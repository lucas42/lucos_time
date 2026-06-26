import { URL } from 'url';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import { hashElement } from 'folder-hash';
export default async () => {
	return {
		entry: {
			client: './client/index.js',
			serviceworker: './service-worker/index.js',
		},
		output: {
			filename: '[name].js',
			path: new URL('./resources/', import.meta.url).pathname,
		},
		plugins: [
			// Get the hashes of all the resources, client source, and dependencies to embed in a comment in service worker.
			// Client JS Hash ensures source-only changes produce a different serviceworker.js in Docker/CI builds.
			// Dependency Hash covers package-lock.json so that dependency-only changes also trigger a browser SW update.
			new webpack.BannerPlugin({
				banner: `Resource Hash: ${(await hashElement("./resources")).hash}\nClient JS Hash: ${(await hashElement("./client")).hash}\nDependency Hash: ${(await hashElement("./package-lock.json")).hash}`,
				include: 'serviceworker',
			}),
		],
		optimization: {
			// Stop the terser plugin messing with the banner plugin
			minimizer: [new TerserPlugin({
				extractComments: false,
			})],
		},
		mode: 'production',
	};
};