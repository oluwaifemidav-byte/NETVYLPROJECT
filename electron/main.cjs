const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
let mainWindow, nextServer;
const WEB_URL = process.env.NETVYL_WEB_URL || '';
const isDev = !app.isPackaged;
function createWindow() {
  mainWindow = new BrowserWindow({width:1440,height:920,minWidth:1100,minHeight:700,title:'NETVYL Business Management Platform',backgroundColor:'#0d0b0c',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return {action:'deny'}});
  mainWindow.loadURL(WEB_URL || (isDev?'http://localhost:3000':'http://127.0.0.1:3210'));
}
function startLocalNextServer(){if(WEB_URL||isDev)return; const serverPath=path.join(process.resourcesPath,'next-server','server.js'); nextServer=spawn(process.execPath,[serverPath],{env:{...process.env,PORT:'3210',HOSTNAME:'127.0.0.1'},windowsHide:true}); nextServer.on('error',console.error);}
app.whenReady().then(()=>{startLocalNextServer(); if(!WEB_URL&&!isDev)setTimeout(createWindow,1200); else createWindow(); app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('window-all-closed',()=>{if(nextServer)nextServer.kill();if(process.platform!=='darwin')app.quit()});
