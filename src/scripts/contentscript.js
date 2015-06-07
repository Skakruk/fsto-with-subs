var subsVideoPlayer = (function () {
    'use strict';

    return {
        playerEl: null,
        usedOld: false,
        subtitleSelected: false,
        currentFileData: {},
        enTitle: "",
        subtitles: [],
        videoIndex: 0,
        playlist: [],
        params: {
            osUrl: "http://www.opensubtitles.org"
        },
        videojsTemplate: '<video id="main_video" class="video-js vjs-sublime-skin" controls preload="auto" width="100%" height="100%"></video>',
        subtitlesControlTemplate: '<div class="subtitles-wrap">\
            <div class="close">&times;</div>\
            <div class="m-subtitles loading">\
                <ul class="subtitles-list"></ul>\
                <div class="controls">\
                    <label class="addSubtitle">+<input type="file" id="uploadSrt"/></label>\
                    <div class="shift-wrap hidden">\
                        <input type="range" title="Сдвиг субтитров: 0 сек" class="shiftSlider" min="-20" max="20" step="0.2" />\
                        <output class="shiftShow"></output>\
                    </div>\
                    <span class="turn-off-subs hidden" title="Выключить субтитры">&times;</span>\
                </div>\
            </div>\
        </div>\
        ',
        subtitlesControlLink: '<a href="#" class="subtitles-title"><span>Субтитры</span></a>',
        injectScript: function (name) {
            var s = document.createElement('script');
            s.src = chrome.extension.getURL(name);
            s.onload = function () {
                this.parentNode.removeChild(this);
            };

            (document.head || document.documentElement).appendChild(s);
        },

        injectCss: function (name) {
            var s = document.createElement('link');
            s.href = chrome.extension.getURL(name);
            s.rel = "stylesheet";
            $(".b-iframe-aplayer iframe").contents().find("head").append(s);
        },
        subs: {
            t: null,
            shift: 0,
            data: [],
            currentText: {},
            currentTime: 0,
            currentIndex: -1,
            nextText: function () {
                var me = this;
                me.currentIndex++;
                me.currentText = {};
                if (me.data.length - 1 >= me.currentIndex) {
                    var c = me.data[me.currentIndex].subtitle;
                    if (c.start < me.currentTime)
                        me.currentText = c;
                }
            },
            search: function () {
                var me = this;
                me.currentText = {};
                me.currentIndex = -1;
                me.data.forEach(function (d, i) {
                    if (d.subtitle.start < me.currentTime && d.subtitle.end > me.currentTime) {
                        me.currentIndex = i;
                        me.currentText = d.subtitle;
                    }
                });
            },
            show: function (time) {
                var me = this;
                me.holder = me.$(".subs-holder span");
                me.player =  me.$(".b-aplayer__html5-desktop")[0];
                if (!me.currentText.end) {
                    me.search();
                    me.holder.html(me.currentText && me.currentText.text || "");
                }

                if (me.currentText.end < me.currentTime) {
                    me.nextText();
                    me.holder.html(me.currentText && me.currentText.text || "");
                }

                clearTimeout(me.t);
                me.t = setTimeout(function () {
                    me.currentTime = me.player.currentTime + me.shift;
                    me.show();
                }, 200);
            },
            hide: function () {
                this.currentIndex = -1;
                this.currentText = {};
                this.holder.text("");
            },
            removeHolder: function () {
                this.holder.remove();
            }

        },

        feedSubtitles: function () {
            var me = this;
            me.$(".main.m-aplayer__html5-desktop-controls_video .subs-holder").remove();
            me.$(".main.m-aplayer__html5-desktop-controls_video").append('<div class="subs-holder"><span></span></div>');
            me.subs.holder = me.$(".subs-holder span");
            me.subs.currentText = {};
            me.subs.data = parseSRT({
                text: me.subtitlesData
            }).data;
            me.subs.show();
        },
        osAPI: {
            options: {
                url: "http://api.opensubtitles.org/xml-rpc",
                token: localStorage.getItem('ostoken')
            },
            login: function () {
                var me = this;
                if (!me.options.token) {
                    return $.xmlrpc({
                        url: me.options.url,
                        methodName: 'LogIn',
                        params: ["", "", "", 'OSTestUserAgent'],
                        success: function (response) {
                            if (response[0].status === '200 OK') {
                                me.options.token = response[0].token;
                                localStorage.setItem('ostoken', me.options.token);
                            }
                        },
                        error: function (jqXHR, status, error) {
                            console.log(arguments)
                        }
                    });
                } else {
                    var def = $.Deferred();
                    def.resolve();
                    return def.promise();
                }

            },
            search: function (title, year, s, e) {
                var me = this;
                me.prevArguments = arguments;
                var def = $.Deferred();
                $.xmlrpc({
                    url: me.options.url,
                    methodName: 'SearchSubtitles',
                    params: [
                        me.options.token, [{
                            sublanguageid: "eng",
                            query: title + " " + year + " s" + s + "e" + e
                        }]
                    ],
                    success: function (response, status, jqXHR) {
                        if (response[0].status === '401 Unauthorized') {
                            me.options.token = null;
                            me.login().done(function () {
                                me.search.apply(me, me.prevArguments).done(function () {
                                    def.resolve.apply(null, arguments);
                                });
                            })
                        } else {
                            def.resolve.apply(null, arguments);
                        }
                    }
                });
                return def.promise();
            },
            download: function (subtitleIds) {
                var me = this;
                return $.xmlrpc({
                    url: me.options.url,
                    methodName: 'DownloadSubtitles',
                    params: [
                        me.options.token,
                        subtitleIds
                    ]
                });
            },

            decode: function (string) {
                var strData = atob(string);
                var charData = strData.split('').map(function (x) {
                    return x.charCodeAt(0);
                });
                var binData = new Uint8Array(charData);
                var data = pako.inflate(binData);
                return String.fromCharCode.apply(null, new Uint16Array(data));
            }

        },

        fetchSubs: function () {
            var me = this,
                gettingSubs = new $.Deferred(),
                controlsEl = me.$(".b-aplayer__actions-translation"),
                popupEl = me.$(".b-aplayer__actions-wrap");

            me.subtitles = {};
            me.$(".subtitles-title").remove();
            controlsEl.before(me.$(me.subtitlesControlLink));

            me.$(".subtitles-wrap").remove();
            popupEl.append(me.$(me.subtitlesControlTemplate));

            popupEl.on("change", "#uploadSrt", function () {
                var mee = this;
                var reader = new FileReader();
                reader.readAsText(this.files[0], "UTF-8");
                reader.onload = function (evt) {
                    me.subtitlesData = evt.target.result;
                    var subli = me.$('<li>' + mee.value.split("\\").pop() + '</li>');
                    me.$(".subtitles-list").append(subli);
                    subli.data("srt", evt.target.result);
                    me.feedSubtitles();
                };
            });

            me.$(".subtitles-title").on("click", function (e) {
                e.preventDefault();
                me.$(".subtitles-wrap").toggle();
            });
            popupEl.find(".close").on("click", function (e) {
                e.preventDefault();
                me.$(".subtitles-wrap").toggle();
            });

            me.$(".m-subtitles").addClass("loading");
            me.osAPI.login().done(function () {
                me.osAPI
                    .search(me.enTitle, me.serial.year, me.currentFileData.fsData.file_season, me.currentFileData.fsData.file_series)
                    .done(function (results) {
                        if (results[0].data) {
                            var ids = [],
                                uniqueNames = [];
                            results[0].data.forEach(function (sub) {
                                if (
                                    sub.SubHearingImpaired == "0" && uniqueNames.indexOf(sub.MovieReleaseName.trim().toLowerCase()) === -1
                                ) {
                                    ids.push(sub.IDSubtitleFile);
                                    me.subtitles[sub.IDSubtitleFile] = {
                                        name: sub.SubFileName.split(".").slice(0, -1).join(".")
                                    };
                                    uniqueNames.push(sub.MovieReleaseName.trim().toLowerCase());
                                }
                            });
                            me.osAPI.download(ids).then(function (results) {
                                if (results[0].data) {
                                    results[0].data.forEach(function (sub) {
                                        me.subtitles[sub.idsubtitlefile].data = me.osAPI.decode(sub.data);
                                    });
                                    gettingSubs.resolve();
                                }
                            })
                        }
                    })
            });

            gettingSubs.then(function () {
                me.$(".m-subtitles").removeClass("loading");
                me.$(".subtitles-list").empty();
                Object.keys(me.subtitles).forEach(function (key) {
                    var sub = me.subtitles[key],
                        subli = '';

                    if (me.usedOld) {
                        subli = me.$('<li><a href="#">' + sub.name + '</li></li>');
                    } else {
                        subli = me.$('<li class="b-player-page-controls__item-dropdown-item">' + sub.name + '</li>');
                    }

                    me.$(".subtitles-list").append(subli);
                    subli.data("srt", sub.data);
                });

                me.$(".subtitles-list").on("click", "li", function (e) {
                    e.preventDefault();
                    me.$(".subtitles-list li").removeClass("selected");
                    var selectedSub = me.$(this);
                    selectedSub.addClass("selected");
                    me.params.shift = 0;
                    if (selectedSub.data("srt")) {
                        me.subtitlesData = selectedSub.data("srt");
                        me.feedSubtitles();
                        me.subtitleSelected = true;
                        me.$(".shift-wrap").removeClass("hidden");
                        me.$(".turn-off-subs").removeClass("hidden");
                    } else {
                        me.subtitleSelected = false;
                        me.$(".shift-wrap").addClass("hidden");
                    }
                });

                if (me.subtitleSelected) {
                    me.$(".subtitles-list li:first-child").trigger("click");
                }
                me.$(".turn-off-subs").on("click", function () {
                    me.$(".subtitles-wrap .selected").removeClass("selected");
                    me.subs.removeHolder();
                    me.$(this).addClass("hidden");
                    me.$('.shift-wrap').addClass("hidden");
                    me.subtitleSelected = false;
                });
            });

            me.$('.shiftSlider').off("input").on("input", function () {
                me.subs.hide();
                me.subs.shift = parseFloat(this.value);
                me.$(this).attr("title", "Сдвиг субтитров: " + (me.subs.shift > 0 ? "+" : "") + me.subs.shift.toFixed(1) + " сек");
                me.$(".shiftShow").val((me.subs.shift > 0 ? "+" : "") + me.subs.shift.toFixed(1));
                me.subs.show();
            });


        },
        loadVideo: function () {
            var me = this;
            console.log(me.currentFileData);
            me.videojsPlayer.src({type: "video/mp4", src: me.currentFileData.url});
            me.videojsPlayer.play();
        }
    }
});

var videoPlayer = new subsVideoPlayer();

['scripts/inject.js'].forEach(function (name) {
    videoPlayer.injectScript(name);
});

window.addEventListener("message", function (event) {
    if (event.source != window)
        return;
    switch (event.data.eventName) {
        case "videoStartPlay":
            videoPlayer.serial = event.data.serial;
            var videoDef = $.Deferred();
            videoDef.promise();

            if (!videoPlayer.enTitle) {

                $.get(videoPlayer.serial.url, function (data) {
                    videoPlayer.enTitle = $(data).find(".b-tab-item__title-origin").text();
                    videoDef.resolve();
                })
            } else {
                videoDef.resolve();
            }

            videoPlayer.currentFileData = event.data.playlistItem;

            if (videoPlayer.customPl) {
                videoPlayer.loadVideo();
            }

            videoDef.done(function () {
                videoPlayer.fetchSubs();
            });

            videoPlayer.$ = videoPlayer.subs.$ = function(selector){
                return $(selector, $(".b-iframe-aplayer iframe")[0].contentDocument);
            };

            ['css/inject.css'].forEach(function (name) {
                videoPlayer.injectCss(name);
            });


            break;

        case "fileSelected":
            videoPlayer.currentFileData = event.data.currentfile;
            videoPlayer.enTitle = $(".b-player-skin__header-origin").text();
            videoPlayer.fetchSubs();
            break;
    }
}, false);
