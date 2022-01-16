const fs = require('fs');
const childProcess = require('child_process');
const UPX = require('upx')('better');
const { compile } = require('nexe');
var compressor = require('node-minify');

//to remove that strange console log go to node_modules/node-minify/lib/compressors/gcc.js line 66


let files = fs.readdirSync('./core');//get files to compress
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function minify_code(){
	return new Promise((resolve) => {
		try
		{
			for(let file of files){
				if(file.includes(".js")){
					compress(file);
				} else {
					let files_deep = fs.readdirSync('./core/' + file);
					for(let file_0 of files_deep){
						if(file_0.includes(".js")){
							compress(file_0, file);
						} else {
							console.log("file is too deep");
						}
					}
				}
			}
			function compress(file, deepnessFolder = ""){
				let path_ = (deepnessFolder != "")?"/"+deepnessFolder:"";
				console.log("compressing: ./core" + path_ + "/" + file);
				compressor.minify({
				  compressor: 'gcc',
				  input: "./core" + path_ + "/" + file,
				  output: "./coreMinify" + path_ + "/" + file,
				  callback: function(err, min) {}
				});
			}
		} catch(exception) {
			resolve();
		}
		resolve();
	});
	
}
function renameFolders_1(){
	fs.rename("./core", "./core_source", (err) => {
    if(err) {
        throw err;
    }
	fs.rename("./coreMinify", "./core", (err) => {
		if(err) {
			throw err;
		}
		
	});
});
}
function compileBuild(){
	return new Promise((resolve) => {
	compile({
		input: './core/main.js',
		output: 'Server-Uncompressed',
		build: false,
		ico: 'dev/res/icon.ico'
	}).then(function(err) {
		console.log(" ");
		console.log("\x1b[32m√ Server Compiled!\x1b[0m");
		childProcess.execFile('dev/bin/ResourceHacker.exe', [
			'-open',
			'Server-Uncompressed.exe',
			'-save',
			'Server-Icon.exe',
			'-action',
			'addoverwrite',
			'-res',
			'dev/res/icon.ico',
			'-mask',
			'ICONGROUP,MAINICON,'
		], function(err) {
			//fs.unlinkSync('Server-Uncompressed.exe');
			console.log("\x1b[32m√ Icon Changed!\x1b[0m");
			UPX('Server-Icon.exe')
			.output('Server.exe')
			.start().then(function(stats) {
				console.log(stats);
				console.log("\x1b[32m√ Server Compressed!\x1b[0m");		

			}).finally(() => {
				resolve();
			}).catch(function (err) {
				console.log(err);
				reject();
			});
		});
	});
	});
}
function renameFolders_2(){
	fs.rename("./core", "./coreMinify", (err) => {
		if(err) {
			throw err;
		}
		fs.rename("./core_source", "./core", (err) => {
			if(err) {
				throw err;
			}
			
		});
	});
}
function DrawSpacingHeader(text){
	console.log('============================================================');
	console.log(`=== | ${text} |`);
	console.log('============================================================');
}

async function main(){
	DrawSpacingHeader('Deleting old coreMinify.');

	if(fs.existsSync('./coreMinify'))
		fs.rmdirSync('./coreMinify', { recursive: true }); // remove folder sync.

	DrawSpacingHeader('Minify the Core');

	await minify_code();

	DrawSpacingHeader('Preparing core for building');

	await renameFolders_1();

	console.log('============================================================');
	let i = 1;
	while(!fs.existsSync("./core")){
		console.log(`=== | Waiting [${i++}]`)
		await sleep(500);
	}
	console.log('============================================================');
	console.log('');
	DrawSpacingHeader('Deleting old server builds');

	if(fs.existsSync('Server.exe'))
		fs.unlinkSync('Server.exe');	
	if(fs.existsSync('Server-Icon.exe'))
		fs.unlinkSync('Server-Icon.exe');	
	if(fs.existsSync('Server-Uncompressed.exe'))
		fs.unlinkSync('Server-Uncompressed.exe');	

	DrawSpacingHeader("\x1b[34m Starting Server Building!\x1b[0m");

	await compileBuild();

	DrawSpacingHeader("\x1b[32m√ Compilation Finished!\x1b[0m");

	while(!fs.existsSync("./core")){
		console.log(`Waiting [${i++}]`)
		await sleep(500);
	}

	DrawSpacingHeader('Reverting the Core to Source');

	await renameFolders_2();
}

main();
