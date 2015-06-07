$(".b-iframe-aplayer iframe").on("load", function(){
    setTimeout(function () {
        var iframeWindow = $(".b-iframe-aplayer iframe")[0].contentWindow;
        var serial = {
            url: iframeWindow.FS_APLAYER_CONFIG.player.titles.title.url,
            year: iframeWindow.FS_APLAYER_CONFIG.admixerJSONP.settings.materialTargeting.year
        };

        iframeWindow.$(".b-player").on("aplayer:onMetadata", function (e, cl, playlistItem) {
            window.postMessage({
                eventName: "videoStartPlay",
                serial: serial,
                playlistItem: playlistItem
            }, "*");
        });
    }, 1000);
});
