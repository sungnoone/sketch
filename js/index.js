/**
 * Created by hl on 2014/7/10.
 */

var BOSH_HOST = "http://192.168.1.238:7070/http-bind/";
var SHORT_HOST_NAME = "of3";
var LOGON_USER = "t002";
var LOGON_PWD = "t002";
var PUBSUB_SERVICE = "pubsub.of3";
var SUBSCRIBE_NODE_MANE = "sub008";

var NS_DATA_FORMS = "jabber:x:data";
var NS_PUBSUB = "http://jabber.org/protocol/pubsub";
var NS_PUBSUB_OWNER = "http://jabber.org/protocol/pubsub#owner";
var NS_PUBSUB_ERRORS = "http://jabber.org/protocol/pubsub#errors";
var NS_PUBSUB_NODE_CONFIG = "http://jabber.org/protocol/pubsub#node_config";



var SketchCast = {
    pen_down: false,
    old_pos: null,
    color: "00f",
    line_width: 4
};

var my = {
    connection: null,
    connected:false,
    receiver:""
};

$(document).ready(function () {
    load_pref_account();
    //btn_connect();
    sketch_event();
});

//load preference account
function load_pref_account(){
    $("#login_name").val(LOGON_USER);
    $("#login_password").val(LOGON_PWD);
}

//Connect Server
function btn_connect(){
    //重新確認帳號
    LOGON_USER = $("#login_name").val();
    LOGON_PWD = $("#login_password").val();

    var conn = new Strophe.Connection(BOSH_HOST);

    conn.connect(LOGON_USER+"@"+SHORT_HOST_NAME, LOGON_PWD, function (status) {
        if(status === Strophe.Status.CONNECTED) {
            $("#message").append("<p>Connected!!!</p>");
            $("#message").append("<p>login user:"+my.connection.jid+"</p>");
            my.connected = true;
            my.connection.addHandler(on_event,null,null,null,null,PUBSUB_SERVICE);
        }else if(status === Strophe.Status.CONNECTING){
            $("#message").append("<p>Connecting!!!</p>");
        }else if(status === Strophe.Status.DISCONNECTED) {
            $("#message").append("<p>Disconnected!!!</p>");
            my.connected = false;
        }else if(status === Strophe.Status.DISCONNECTING) {
            $("#message").append("<p>Disconnecting!!!</p>");
        }else if(status === Strophe.Status.AUTHENTICATING){
            $("#message").append("<p>Authenticating!!!</p>");
        }else if(status === Strophe.Status.AUTHFAIL){
            $("#message").append("<p>Auth fail!!!</p>");
        }else if(status === Strophe.Status.ERROR){
            $("#message").append("<p>An error has occurred</p>");
        }else if(status === Strophe.Status.ATTACHED){
            $("#message").append("<p>The connection has been attached</p>");
        }else if(status === Strophe.Status.CONNFAIL){
            $("#message").append("<p>Connection fail!!!</p>");
        }else{
            $("#message").append("<p>Status:"+status+"</p>");
        }
    });
    my.connection = conn;
}

//sketch paint event
function sketch_event(){
    $("#sketch").mousedown(function () {
        SketchCast.pen_down = true;
    });
    $("#sketch").mouseup(function () {
        SketchCast.pen_down = false;
    });
    $("#sketch").mousemove(function (ev) {
        // get the position of the drawing area, our offset
        var offset = $(this).offset();
        // calculate our position within the drawing area
        var pos = {x: ev.pageX - offset.left, y: ev.pageY - offset.top};
        if (SketchCast.pen_down) {
            if (!SketchCast.old_pos) {
                SketchCast.old_pos = pos;
                return;
            }
            // render the line segment
            var ctx = $("#sketch").get(0).getContext("2d");
            ctx.strokeStyle = "#" + SketchCast.color;
            ctx.lineWidth = SketchCast.line_width;
            ctx.beginPath();
            ctx.moveTo(SketchCast.old_pos.x, SketchCast.old_pos.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            publish_action({
                color: SketchCast.color,
                line_width: SketchCast.line_width,
                from: SketchCast.old_pos,
                to: pos
            });
            SketchCast.old_pos = pos;
        } else {
            SketchCast.old_pos = null;
        }
    });

    $(".color").click(function (ev) {
        SketchCast.color = $(this).attr("id").split("-")[1];
    });
    $(".linew").click(function (ev) {
        SketchCast.line_width = $(this).attr("id").split("-")[1];
    });
    $("#erase").click(function () {
        var ctx = $("#sketch").get(0).getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#fff";
        ctx.fillRect(0, 0, 600, 500);
    });
}

function subscribe_service(){
    //create node
    //var xmlStr = '<iq to="pubsub.of3" from="t002@of3" type="set" id="create1"><pubsub xmlns="http://jabber.org/protocol/pubsub"><create node="sub002"/></pubsub></iq>';

    var createiq = $iq({to:PUBSUB_SERVICE,type:"set",id:"create2"}).c('pubsub', {xmlns:NS_PUBSUB}).c('create',{node:SUBSCRIBE_NODE_MANE});
    my.connection.sendIQ(createiq,subscribe_created,subscribe_create_error);

}

//建立訂閱
function subscribe_created(iq){
    // find pubsub node
    //alert("Created.\r\n"+iq.outerHTML);
    var node = $(iq).find("create").attr('node');
    $("#message").append("<p>node:"+node+"</p>");
    //修正 pubsub#publish_model 屬性，預設 publishers 改為 open，否則只有owner能發佈
    var config_node = $iq({to:PUBSUB_SERVICE,from:my.connection.jid,type:"set",id:"config1"})
        .c('pubsub', {xmlns:NS_PUBSUB_OWNER})
        .c('configure',{node:SUBSCRIBE_NODE_MANE})
        .c('x',{xmlns:NS_DATA_FORMS,type:"submit"})
        .c('field', {"var": "pubsub#publish_model"})
        .c('value').t('open');
    my.connection.sendIQ(config_node,config_subscribe_success,config_subscribe_error);
}

//create subscribe node error
function subscribe_create_error(iq){
    //alert("Create error!!\r\n"+iq.outerHTML);
    var error = make_error_from_iq(iq);
    if (error === "conflict"){
        //如果已經存在直接訂閱
        $("#message").append("<p>Node已存在 :" +error+"</p>");
        // now subscribe
        var subiq = $iq({to: PUBSUB_SERVICE,type:"set"}).c("pubsub", {xmlns:NS_PUBSUB}).c("subscribe", {node:SUBSCRIBE_NODE_MANE,jid:my.connection.jid});
        my.connection.sendIQ(subiq,subscribe_successful,subscribe_error);
    }else{
        //其他失敗
        $("#message").append("<p>Node creation failed with :" +error+"</p>");
    }

}

//pubsub service message handler
function on_event(msg){
    //$("#message").append("<p>"+msg+"</p>");
    $("#message").append("<div>"+xml2html(Strophe.serialize(msg))+"</div>");
    if($(msg).find('x').length === 0){
        return true;
    }

    var color = $(msg).find('field[var="color"] value').text();
    var line_width = $(msg).find('field[var="line_width"] value').text();
    var from_pos = $(msg).find('field[var="from_pos"] value').text().split(',');
    var to_pos = $(msg).find('field[var="to_pos"] value').text().split(',');
    var action = {
        color: color,
        line_width: line_width,
        from: {x: parseFloat(from_pos[0]),y: parseFloat(from_pos[1])},
        to: {x: parseFloat(to_pos[0]),y: parseFloat(to_pos[1])}
    };
    render_action(action);
    return true;
}

//identification error type
function make_error_from_iq(iq){
    var error = $(iq).find('*[xmlns="' + Strophe.NS.STANZAS + '"]').get(0).tagName;
    //alert(error);
    var pubsub_error = $(iq).find('*[xmlns="' + NS_PUBSUB_ERRORS + '"]');
    if (pubsub_error.length > 0) {
        error = error + "/" + pubsub_error.get(0).tagName;
    }
    return error;
}

//訂閱成功處理
function subscribe_successful(iq){
    //alert("訂閱成功.\r\n"+iq.outerHTML);
}

//訂閱發生錯誤處理
function subscribe_error(iq){
    $("#message").append("<p>訂閱有誤</p>");
}

//訂閱偏好設定成功
function config_subscribe_success(iq){
    $("#message").append("<p>訂閱設定成功</p>");
}

//
function config_subscribe_error(iq){
    $("#message").append("<p>訂閱設定錯誤</p>");
}

//
function publish_action(action){
    my.connection.sendIQ(
        $iq({to: PUBSUB_SERVICE,type: "set"})
            .c('pubsub', {xmlns: NS_PUBSUB})
            .c('publish', {node: SUBSCRIBE_NODE_MANE})
            .c('item')
            .c('x', {xmlns: NS_DATA_FORMS,type: "result"})
            .c('field', {"var": "color"})
            .c('value').t(action.color)
            .up().up()
            .c('field', {"var": "line_width"})
            .c('value').t('' + action.line_width)
            .up().up()
            .c('field', {"var": "from_pos"})
            .c('value').t('' + action.from.x + ',' + action.from.y)
            .up().up()
            .c('field', {"var": "to_pos"})
            .c('value').t('' + action.to.x + ',' + action.to.y));
}

function render_action(action){
    // render the line segment
    var ctx = $('#sketch').get(0).getContext('2d');
    ctx.strokeStyle = '#' + action.color;
    ctx.lineWidth = action.line_width;
    ctx.beginPath();
    ctx.moveTo(action.from.x, action.from.y);
    ctx.lineTo(action.to.x, action.to.y);
    ctx.stroke();
}


//=======================================

//list pubsub nodes
function list_subscribe_service(){
    if(my.connected === false){
        $("#message").append("<p>伺服器未連線...</p>");
        return false;
    }
    var query_attrs = {};
    query_attrs["xmlns"] = "http://jabber.org/protocol/disco#items";
    my.connection.sendIQ($iq({to:"pubsub.of3",type:"get"}).c("query", query_attrs), function(iq, elem){
        $("#message").empty();
        $("#message").append("<ul id='items'></ul>");
        $(iq).find("item").each(function(){
            $("#items").append("<li>"+$(this).attr("jid")+":"+$(this).attr("node")+"</li>");
        });
    })
}

//======================================

//xml string to html
function xml2html(str){
    //去除XML字串中會導致Html顯示有問題的特定符號
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

//======================================

function clear_message(){
    $("#message").empty();
}