const {chromium}=require('playwright');const {spawn}=require('child_process');const fs=require('fs');
const spec=JSON.parse(fs.readFileSync('spec.json')),tim=JSON.parse(fs.readFileSync('timing.json'));
const only=process.argv[2];const FPS=30,N=180;
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:720,height:1280}});
await p.goto('file://'+process.cwd()+'/page.html');
for(const s of spec){if(only&&!only.split(',').includes(s.id))continue;
 await p.evaluate(([s,t])=>window.setup(s,t),[s,tim[s.id]]);
 const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-i',`vo/${s.id}.wav`,
  '-c:v','libx264','-profile:v','high','-preset','veryfast','-crf','24','-maxrate','4M','-bufsize','8M','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','128k','-ac','2','-shortest','-movflags','+faststart',`out/${s.id}.mp4`]);
 for(let i=0;i<N;i++){await p.evaluate(t=>window.render(t),i/FPS);const buf=await p.screenshot({type:'jpeg',quality:92});
  if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
 ff.stdin.end();await new Promise(r=>ff.on('close',r));console.log('done',s.id)}
await b.close()})();
