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
const musicListId = "2092474396";
const config = {
    musicLink : "http://music.163.com/#/playlist?id=",
    musicFrame : "contentFrame",
    playList : "span.ply",
    listName: "h2.f-ff2.f-brk",
    musicNameList: "a > b"

};
(async () => {
    const browser = await puppeteer.launch({headless:false});
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(2*60*1000)
    let musicListName = null;
    let musicName = null;
    let lock = false;
    let logged = [];
    await page.setRequestInterception(true);
    //记下来歌曲对应的链接
    page.on('request', request => {
        if (request.resourceType() === 'media' && request.url().indexOf(".mp3") > 0) {
            if (!logged.contains(request.url())) {
                lock = false;
                logged.push(request.url());
                downloadFile(request.url(), musicListName, musicName);
            }
            request.abort();
        }
        else {
            request.continue();
        }
    });
    await page.setViewport({width: 1027, height: 768});
    console.log("等待加载页面...");
    await page.goto(config.musicLink + musicListId);
    console.log("加载页面成功");
    //获取播放页面的iframe
    const mPage = await page.frames().find(f => f.name() === config.musicFrame);
    const playList = await mPage.$$(config.playList);
    musicListName = await mPage.$eval(config.listName, mf => mf.innerHTML);
    mkdirp(musicListName, function (err) {
        if (err) {
            console.log(err);
        }
    });
    const musicNames = await mPage.$$eval(config.musicNameList, bs => {
        return bs.map(b => {
            return b.title
        });
    });
    for (let i = 0; i < playList.length; i++) {
        lock = true;
        musicName = musicNames[i] + ".mp3";
        //尝试至多5次，没有获取到地址就放弃
        const retryCount = 5;
        for (let j = 0; j < retryCount; j++) {
            await playList[i].click();
            await page.waitFor(100);
            if (lock === false) {
                break;
            }
            if (j === retryCount - 1 && lock === true) {
                lock = false;
                console.log("下载 " + musicName + " 失败")
            }
            await page.waitFor(500);
        }
        //按3次下箭头就会挪动4个。偷懒的硬编码。。。。。。。。。。
        if (i % 4 !== 0) {
            await page.keyboard.press("ArrowDown")
        }
    }
})();


async function downloadFile(uri, folder, filename) {
    let stream = fs.createWriteStream(folder + "/" + filename);
    request(uri).on('error', err => {
        console.log("下载 " + filename + " 失败");
    }).pipe(stream).on('finish', function () {
        console.log("下载 " + filename + " 成功");
    });
}

