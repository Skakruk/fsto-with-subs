$(function(){
    $(".l-content-player").on("fsPlayerControls:fileSelected", function(e, file){
        $("body").attr("currentfile", JSON.stringify(file.file)).trigger("filechange");
    })

})
