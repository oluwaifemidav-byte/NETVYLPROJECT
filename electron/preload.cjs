const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('netvylDesktop',{platform:process.platform,version:'V31'});
