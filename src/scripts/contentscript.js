var subsVideoPlayer = (function() {
    'use strict';

    return {
        playerEl: null,
        subtitleSelected: false,
        currentFileData: {},
        enTitle: "",
        subtitles: [],
        videoIndex: 0,
        playlist: [],
        params: {
            osUrl: "http://www.opensubtitles.org",
            shift: 0
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
                    <label class="addSubtitle">+<input type="file" id="uploadSrt"/></label>\
                    <div class="shift-wrap">\
                        <input type="range" class="shiftSlider" min="-20" max="20" step="0.2">\
                        <div class="shiftShow" />\
                    </div>\
                    <div class="b-player-page-controls__item-dropdown-hide"><span>Свернуть</span></div>\
                </div>\
            </div>\
        </div>\
        ',
        template: '<div class="custom_video">\
                <video preload="auto" autobuffer controls id="pl_container"></video>\
            </div>',
        injectScript: function(name) {
            var s = document.createElement('script');
            s.src = chrome.extension.getURL(name);
            s.onload = function() {
                this.parentNode.removeChild(this);
            };
            (document.head || document.documentElement).appendChild(s);
        },

        injectCss: function(name) {
            var s = document.createElement('link');
            s.href = chrome.extension.getURL(name);
            s.rel = "stylesheet";
            // s.onload = function () {
            //     this.parentNode.removeChild(this);
            // };
            (document.head || document.documentElement).appendChild(s);
        },
        getPlayer: function() {
            this.oldPlayer = $(".l-content-player-player");
            return this.oldPlayer;
        },
        removeOldPlayer: function() {
            this.getPlayer().remove();
        },
        insertNewPlayer: function() {
            var oPl = this.getPlayer();
            var width = oPl.css("width");
            var height = oPl.css("height");


            $(".l-content-player-player")
                .css("height", "+=25px")
                .html(this.template);

            this.playerEl = $("#pl_container")
                .css({
                    height: height,
                    width: width
                });
            this.player = Popcorn("#pl_container");
            return this.player;
        },
        requestZip: function(url) {
            return $.ajax({
                url: url,
                encoding: null,
                type: 'GET',
                contentType: "application/zip",
                mimeType: 'text/plain; charset=x-user-defined'
            });
        },
        feedSubtitles: function() {
            var me = this;
            $("#subs_holder").empty();
            parseSRT({
                text: me.subtitlesData
            }).data.forEach(function(sub) {
                sub.subtitle.start += me.params.shift;
                sub.subtitle.end += me.params.shift;
                me.player.subtitle(sub.subtitle)
            })
        },
        showShiftValue: function() {
            var me = this;
            $('.shiftShow, .leftGrip')
                .text((me.params.shift > 0 ? "+" : "") + me.params.shift.toFixed(1));
            $(".leftGrip").css("marginLeft", "-" + parseInt($(".leftGrip").css("width")) / 2 + "px")
        },

        osAPI: {
            options: {
                url: "http://api.opensubtitles.org/xml-rpc",
                token: localStorage.getItem('ostoken')
            },
            login: function(){
                var me = this;
                if(!me.options.token){
                   return $.xmlrpc({
                        url: me.options.url,
                        methodName: 'LogIn',
                        params: ["", "", "", 'OSTestUserAgent'],
                        success: function(response, status, jqXHR) {
                            if(response[0].status === '200 OK'){
                                me.options.token = response[0].token;
                                localStorage.setItem('ostoken', me.options.token);
                            }
                        },
                        error: function(jqXHR, status, error) {
                            console.log(arguments)
                        }
                    }); 
                }else{
                    var def = $.Deferred();
                    def.resolve();
                    return def.promise();
                }
                
            },
            search: function(title, year, s, e){
                var me = this;
                return $.xmlrpc({
                    url: me.options.url,
                    methodName: 'SearchSubtitles',
                    params: [
                        me.options.token,
                        [{
                            sublanguageid: "eng",
                            query: title + " " + year + " s" + s + "e" + e
                        }]
                    ],
                    success: function(response, status, jqXHR) {
                        console.log(arguments)
                    }
                });
            },
            download: function(subtitleIds){
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

            decode: function(string){
                var strData = atob(string);
                var charData = strData.split('').map(function(x){return x.charCodeAt(0);});
                var binData = new Uint8Array(charData);
                var data = pako.inflate(binData);
                return String.fromCharCode.apply(null, new Uint16Array(data));
            }

        },

        fetchSubs: function() {
            var me = this,
                pipe = [],
                gettingSubs = new $.Deferred();
            var startYear = $(".b-player-skin__year a:first-child span").text();
            me.subtitles = {};
            var controlsEl = $(".b-player-page-controls__folder-content-wrap:visible");
            controlsEl.find(".b-player-page-controls__subtitles-wrap").remove();
            controlsEl.append($(me.subtitlesControlTemplate));
            var subsElWrap = $(".b-player-page-controls__subtitles-wrap");

            me.osAPI.login().then(function(){
                me.osAPI
                    .search(me.enTitle, startYear, me.currentFileData.fsData.file_season, me.currentFileData.fsData.file_series)
                    .then(function(results){
                        if(results[0].data){
                            var ids = [], uniqueNames = [];
                            results[0].data.forEach(function(sub){

                                if(
                                    sub.SubHearingImpaired == "0"
                                    && uniqueNames.indexOf(sub.MovieReleaseName.trim().toLowerCase()) === -1
                                ){
                                    ids.push(sub.IDSubtitleFile);
                                    me.subtitles[sub.IDSubtitleFile] = {
                                        name : sub.MovieReleaseName
                                    };
                                    uniqueNames.push(sub.MovieReleaseName.trim().toLowerCase());
                                }
                            });
                            me.osAPI.download(ids).then(function(results){
                                if(results[0].data){
                                    results[0].data.forEach(function(sub){
                                        me.subtitles[sub.idsubtitlefile].data = me.osAPI.decode(sub.data);
                                    });
                                    gettingSubs.resolve();
                                }
                            })
                        }
                    })
            })

            
            gettingSubs.then(function() {
                $(".subtitles-list").empty();
                Object.keys(me.subtitles).forEach(function(key) {
                    var sub = me.subtitles[key];
                    var subli = $('<li class="b-player-page-controls__item-dropdown-item">' + sub.name + '</li>');
                    $(".subtitles-list").append(subli);
                    subli.data("srt", sub.data);
                });

                $(".subtitles-list li").on("click", function() {
                    $(".subtitles-list li").removeClass("selected");
                    var selectedSub = $(this);
                    selectedSub.addClass("selected")
                    me.params.shift = 0;
                    if (selectedSub.data("srt")) {
                        me.subtitlesData = selectedSub.data("srt");
                        me.feedSubtitles();
                        me.subtitleSelected = true;
                        $(".shift-wrap").show();
                    } else {
                        me.subtitleSelected = false;
                        $(".shift-wrap").hide();
                    }
                });

                if (me.subtitleSelected) {
                    $(".subtitles-list li:first-child").trigger("click");
                }
            });
        },
        _getUrlVars: function() {
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
        loadVideo: function() {
            var me = this;
            me.playerEl.attr("src", me.currentFileData.videoUrl);
        },
        startShow: function(){
            var me = this;
            if($(".l-content-player-skin").is(":visible")){
                $(".b-player-skin-play").show();
            }else{
                me.player.play();
            }
        },
        replacePlayer: function(oldPlayerOptions) {
            var me = this;

            me.insertNewPlayer();

            $("#uploadSrt").on("change", function() {
                var reader = new FileReader();
                reader.readAsText(this.files[0], "UTF-8");
                reader.onload = function(evt) {
                    me.subtitlesData = evt.target.result;
                    me.feedSubtitles();
                };
            });

            me.playerEl.prop("volume", localStorage.getItem("fs.volume") || 0.5);

            $(document).on("keydown", function(e) {
                if (e.keyCode === 32) {
                    if (player.paused())
                        me.player.play();
                    else
                        me.player.pause();
                }
            });

            me.playerEl.on("click", function() {
                if (me.player.paused())
                    me.player.play();
                else
                    me.player.pause();
            });


            me.enTitle = $(".b-player-skin__header-origin").text();

            me.player.on("ended", function() {
                me.videoIndex += 1;
                if (me.videoIndex !== me.playlist.length) {
                    me.currentFileData = me.playlist[me.videoIndex];
                    me.loadVideo();
                    me.params.shift = 0;
                }
            })

            me.player.on("playing", function() {

            })

            me.player.on("volumechange", function() {
                localStorage.setItem("fs.volume", me.playerEl.prop("volume"));
            });



            $("#episode").on("change", function() {
                me.fetchSubs();
            })

            me.showShiftValue();

            $('.shiftSlider').on("change", function() {
                if (me.subtitlesData) {
                    me.params.shift = parseInt(this.value);
                    //me.feedSubtitles();
                    me.showShiftValue();
                } else {
                    $(".shift-wrap").hide();
                }
            });

            $(".b-player-skin-play").on("click", function() {
                me.player.play();
            })
        }
    }
});

var videoPlayer = new subsVideoPlayer();

['scripts/inject.js'].forEach(function(name) {
    videoPlayer.injectScript(name);
});

var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.attributeName === "currentfile") {
            videoPlayer.currentFileData = JSON.parse($("body").attr("currentfile"));
            videoPlayer.loadVideo();
            videoPlayer.fetchSubs();
            videoPlayer.startShow();
        }
    })
});
observer.observe(document.querySelector("body"), {
    attributes: true
});

videoPlayer.replacePlayer();
