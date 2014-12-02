$(function(){
    $(".l-content-player").on("fsPlayerControls:fileSelected", function(e, file){
        $("body").attr("currentfile", JSON.stringify(file.file));
    })
    $(".l-content-player").on("aplayer:onProgress", function(e, state, file){
        $(".l-content-player").attr("onprogress", JSON.stringify({state: state, file: file}));
    })
    
})
