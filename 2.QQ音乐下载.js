'use strict';
//已知问题：开启headless模式，无法加载页面。（怀疑是电脑性能问题，有知道的原因还请告知）。
const puppeteer = require('puppeteer');
const request = require('request');
const fs = require('fs');
const mkdirp = require('mkdirp');


//给数组添加contains方法
Array.prototype.contains = function (needle) {
    for (let i in this) {
        if (this[i] === needle) return true;
    }
    return false;
};
const songListId = "1421917475";
const config = {
    songLink : "https://y.qq.com/n/yqq/playsquare/" + songListId + ".html",
    playButton : "a.mod_btn_green.js_all_play",
    listName: "#p_name_show",
    playPageLink: "https://y.qq.com/portal/player.html",
    songNameList: "div.songlist__songname > span",
    songSelector: "#song_box > li",
    playList: ".songlist__songname_txt"

};
(async () => {
    const browser = await puppeteer.launch({headless:false});
    const infoPage = await browser.newPage();
    infoPage.setDefaultNavigationTimeout(2*60*1000);
    let songListName = null;
    let songName = null;
    let lock = false;
    let logged = [];
    await infoPage.setViewport({width: 1027, height: 768});
    console.log("等待加载页面...");
    await infoPage.goto(config.songLink, {waitUntil: 'domcontentloaded'});
    console.log("加载页面成功");
    songListName = await infoPage.$eval(config.listName, mln => mln.innerHTML);
    songListName = songListName.replace(/[:"\\/<>?|]/g,"_");
    mkdirp(songListName, function (err) {
        if (err) {
            console.log(err);
        }
    });
    await infoPage.waitForSelector(config.playButton);
    //刚加载时，点击播放并不会打开播放页面，应该是有什么还没有渲染出来，强制等待3S
    await infoPage.waitFor(3000);
    await infoPage.click(config.playButton);
    const playPagePromise = new Promise(x => browser.once('targetcreated', target => x(target.page())));
    const playPage = await playPagePromise;

    await playPage.setRequestInterception(true);
    //记下来歌曲对应的链接
    playPage.on('request', request => {
        if (request.resourceType() === 'media' && request.url().indexOf(".m4a") > 0) {
            if (songName !== null && !logged.contains(request.url())) {
                lock = false;
                logged.push(request.url());
                downloadFile(request.url(), songListName, songName);
            }
            request.abort();
        }
        else {
            request.continue();
        }
    });
    await playPage.waitForSelector("#song_box > li");
    const songNames = await playPage.$$eval(config.songNameList, bs => {
        return bs.map(b => {
            return b.title
        });
    });
    const playList = await playPage.$$(config.playList);
    for (let i = 0; i < playList.length; i++) {
        lock = true;
        songName = songNames[i] + ".m4a";
        songName = songName.replace(/[:"\\/<>?|]/g,"_");
        //尝试至多5次，没有获取到地址就放弃
        const retryCount = 5;
        for (let j = 0; j < retryCount; j++) {
            await playPage.hover(config.songSelector + ":nth-child(" + (i+1) + ")")
            await playList[i].click({clickCount: 2});
            await infoPage.waitFor(100);
            if (lock === false) {
                break;
            }
            if (j === retryCount - 1 && lock === true) {
                lock = false;
                console.log("下载 " + songName + " 失败")
            }
            await infoPage.waitFor(500);
        }
    }
})();

async function downloadFile(uri, folder, filename) {
    let stream = fs.createWriteStream(folder + "/" + filename);
    request(uri).on('error', err => {
        console.log("下载 " + filename + " 失败");
    }).pipe(stream).on('error', function () {
        console.log("下载 " + filename + " 失败");
    }).on('finish', function () {
        console.log("下载 " + filename + " 成功");
    });
}
