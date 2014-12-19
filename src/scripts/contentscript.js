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
        subtitlesControlTemplate: '<div class="b-player-page-controls__subtitles-wrap">\
            <div class="b-player-page-controls__item m-subtitles">\
                <div class="b-player-page-controls__item-selected">\
                    <span class="b-player-page-controls__item-selected-inner">\
                        <span class="subtitles-title">CC</span>\
                    </span>\
                </div>\
                <div class="b-player-page-controls__item-dropdown" style="display: none;">\
                    <ul class="subtitles-list"></ul>\
                    <div class="controls">\
                        <label class="addSubtitle">+<input type="file" id="uploadSrt"/></label>\
                        <div class="shift-wrap hidden">\
                            <input type="range" title="Сдвиг субтитров: 0 сек" class="shiftSlider" min="-20" max="20" step="0.2" />\
                            <output class="shiftShow"></output>\
                        </div>\
                        <span class="turn-off-subs hidden" title="Выключить субтитры">&times;</span>\
                    </div>\
                    <div class="b-player-page-controls__item-dropdown-hide"><span>Свернуть</span></div>\
                </div>\
            </div>\
        </div>\
        ',
        subtitlesControlTemplateOld: '<div class="item b-player-page-controls__subtitles-wrap old-style">\
                <a href="#" class="b-action m-cc m-arrowed" title="Субтитры" rel=".m-cc"><span><b>CC</b></span></a>\
                <div class="b-dropdown m-popup m-cc" style="display: none;">\
                    <div style="clear: both;">\
                        <div class="item"><ul class="subtitles-list"></ul></div>\
                        <div class="controls">\
                            <label class="addSubtitle">+<input type="file" id="uploadSrt"/></label>\
                            <div class="shift-wrap hidden">\
                                <input type="range" title="Сдвиг субтитров: 0 сек" class="shiftSlider" min="-20" max="20" step="0.2" />\
                                <output class="shiftShow"></output>\
                            </div>\
                            <span class="turn-off-subs hidden" title="Выключить субтитры">&times;</span>\
                        </div>\
                        <div class="b-hide m-cc"><a href="#" rel=".m-cc"><span>Свернуть</span></a></div>\
                    </div>\
                </div>\
            </div>\
        ',
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
            // s.onload = function () {
            //     this.parentNode.removeChild(this);
            // };
            (document.head || document.documentElement).appendChild(s);
        },
        requestZip: function (url) {
            return $.ajax({
                url: url,
                encoding: null,
                type: 'GET',
                contentType: "application/zip",
                mimeType: 'text/plain; charset=x-user-defined'
            });
        },

        subs: {
            t: null,
            shift: 0,
            data: [],
            holder: $(".subs-holder span"),
            player: $(".b-aplayer__html5-desktop")[0],
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
            $(".main.m-aplayer__html5-desktop-controls_video .subs-holder").remove();
            $(".main.m-aplayer__html5-desktop-controls_video").append('<div class="subs-holder"><span></span></div>');
            me.subs.holder = $(".subs-holder span");
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
                        success: function (response, status, jqXHR) {
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
                pipe = [],
                gettingSubs = new $.Deferred(),
                controlsEl = null,
                startYear;

            me.subtitles = {};

            if (me.usedOld) {
                controlsEl = $(".b-actions:visible");
                controlsEl.find(".b-player-page-controls__subtitles-wrap").remove();
                controlsEl.append($(me.subtitlesControlTemplateOld));
                $(".b-hide.m-cc, .b-action.m-cc").on("click", function (e) {
                    e.preventDefault();
                    $(".m-popup.m-cc").slideToggle();
                    $(".m-cc.m-arrowed").toggleClass("m-expanded")
                })
                startYear = serial.year;
            } else {
                controlsEl = $(".b-player-page-controls__folder-content-wrap:visible");
                controlsEl.find(".b-player-page-controls__subtitles-wrap").remove();
                controlsEl.append($(me.subtitlesControlTemplate));
                startYear = $(".b-player-skin__year a:first-child span").text();
            }


            var subsElWrap = $(".b-player-page-controls__subtitles-wrap");

            me.osAPI.login().done(function () {
                me.osAPI
                    .search(me.enTitle, startYear, me.currentFileData.fsData.file_season, me.currentFileData.fsData.file_series)
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

                $(".subtitles-list").empty();
                Object.keys(me.subtitles).forEach(function (key) {
                    var sub = me.subtitles[key],
                        subli = '';

                    if (me.usedOld) {
                        subli = $('<li><a href="#">' + sub.name + '</li></li>');
                    } else {
                        subli = $('<li class="b-player-page-controls__item-dropdown-item">' + sub.name + '</li>');
                    }

                    $(".subtitles-list").append(subli);
                    subli.data("srt", sub.data);
                });

                $(".subtitles-list").on("click", "li", function (e) {
                    e.preventDefault();
                    $(".subtitles-list li").removeClass("selected");
                    var selectedSub = $(this);
                    selectedSub.addClass("selected");
                    me.params.shift = 0;
                    if (selectedSub.data("srt")) {
                        me.subtitlesData = selectedSub.data("srt");
                        me.feedSubtitles();
                        me.subtitleSelected = true;
                        $(".shift-wrap").removeClass("hidden");
                        $(".turn-off-subs").removeClass("hidden");
                    } else {
                        me.subtitleSelected = false;
                        $(".shift-wrap").addClass("hidden");
                    }
                });

                if (me.subtitleSelected) {
                    $(".subtitles-list li:first-child").trigger("click");
                }
                $(".turn-off-subs").on("click", function () {
                    $(".b-player-page-controls__subtitles-wrap .selected").removeClass("selected");
                    $(".b-player-page-controls__subtitles-wrap .b-player-page-controls__item-selected-inner").text("CC");
                    me.subs.removeHolder();
                    $(this).addClass("hidden");
                    $('.shift-wrap').addClass("hidden");
                });
            });

            $('.shiftSlider').off("input").on("input", function () {
                me.subs.hide();
                me.subs.shift = parseFloat(this.value);
                $(this).attr("title", "Сдвиг субтитров: " + (me.subs.shift > 0 ? "+" : "") + me.subs.shift.toFixed(1) + " сек");
                $(".shiftShow").val((me.subs.shift > 0 ? "+" : "") + me.subs.shift.toFixed(1));
                me.subs.show();
            });



        },
        _getUrlVars: function () {
            var vars = [],
                hash;
            var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
            for (var i = 0; i < hashes.length; i++) {
                hash = hashes[i].split('=');
                vars.push(hash[0]);
                vars[hash[0]] = hash[1];
            }
            return vars;
        },
        replacePlayer: function (oldPlayerOptions) {
            var me = this;

            $("body").on("change", "#uploadSrt", function () {
                var mee = this;
                var reader = new FileReader();
                reader.readAsText(this.files[0], "UTF-8");
                reader.onload = function (evt) {
                    me.subtitlesData = evt.target.result;
                    var subli;
                    if (me.usedOld) {
                        subli = $('<li><a href="#">' + mee.value.split("\\").pop() + '</li></li>');
                    } else {
                        subli = $('<li class="b-player-page-controls__item-dropdown-item">' + mee.value.split("\\").pop() + '</li>');
                    }
                    $(".subtitles-list").append(subli);
                    subli.data("srt", evt.target.result);
                    me.feedSubtitles();
                };
            });

            $(".b-aplayer__html5-desktop").on("playing", function () {
                me.subs.hide();
                me.subs.search();
                me.subs.show();
            })
        }
    }
});

var videoPlayer = new subsVideoPlayer();


['scripts/inject.js'].forEach(function (name) {
    videoPlayer.injectScript(name);
});

var serial;

videoPlayer.replacePlayer();

window.addEventListener("message", function (event) {
    if (event.source != window)
        return;
    switch(event.data.eventName){
        case "videoStartPlay": 
            videoPlayer.usedOld = true;
            serial = event.data.serial;
            var videoDef = $.Deferred();
            videoDef.promise();
            if (!videoPlayer.enTitle) {
                $.get(serial.url, function (data) {
                    videoPlayer.enTitle = $(data).find(".b-tab-item__title-origin").text();
                    videoDef.resolve();
                })
            } else {
                videoDef.resolve();
            }

            videoPlayer.currentFileData = event.data.playlistItem;

            videoDef.done(function () {
                videoPlayer.fetchSubs();
            })
        break;

        case "fileSelected":
            videoPlayer.currentFileData = event.data.currentfile;
            videoPlayer.enTitle = $(".b-player-skin__header-origin").text();
            videoPlayer.fetchSubs();
        break;
    }
}, false);
