var extId = "ceahmenegedhhaepjkfhgkajjlolmoef";
$(function () {
    

    if (window.FS_APLAYER_CONFIG) {
        var serial = {
            url: window.FS_APLAYER_CONFIG.player.titles.title.url,
            year: window.FS_APLAYER_CONFIG.admixerJSONP.configFunction().admixerOpenRTBRequest.ext.material.year
        }

        $(".m-player-movie").on("aplayer:onMetadata", function (e, cl, playlistItem) {
            window.postMessage({
                eventName: "videoStartPlay",
                serial: serial,
                playlistItem: playlistItem
            }, "*");

        })
    }else{
        $(".l-content-player").on("fsPlayerControls:fileSelected", function (e, file) {
            window.postMessage({
                eventName: "fileSelected",
                currentfile: file.file
            }, "*");
        });
    }

});
