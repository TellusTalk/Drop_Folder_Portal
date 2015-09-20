var
    DROP_FOLDER_PATH = '/drop/folder/',
    WEB_HOST = 'my.server.com',
    WEB_PATH = '/upload/path';

var
    fs = require('fs'),
    query_string = require('querystring'),
    http = require('http'),
    events = require('events');

var
    event_obj = new events.EventEmitter(),
    fs_watcher,
    filenames_list = [],
    consecutive_http_failed_count = 0;


function app_log(text_in) {
    'use strict';
    console.log('[' + (new Date()).toISOString() + ']');
    console.log(text_in);
}

function folder_monitor(event_in, filename_in) {
    'use strict';
    app_log('[folder_monitor] Before http.request, event = ' + event_in + ', filename = ' + filename_in);

    fs_watcher.close();

    if (filenames_list.length === 0) {
        event_obj.emit('drop_folder_event');
    }
}

function read_directory() {
    'use strict';
    fs.readdir(DROP_FOLDER_PATH, function (err, files) {
        filenames_list = files;
        if (err) {
            app_log('[read_directory] fs.readdir(\'error\' ...) ' + err.message);
        }

        if (filenames_list.length > 0) {
            event_obj.emit('HttpPostFile_event');
        } else {
            app_log('[read_directory] Drop_Folder empty, ..wait..');

            fs_watcher = fs.watch(DROP_FOLDER_PATH, folder_monitor);
        }
    });
}

function HttpPostFile() {
    'use strict';
    var
        post_request,
        read_stream,
        filename = filenames_list.pop(),
        post_options = {
            host: WEB_HOST,
            path: WEB_PATH + '?' + query_string.stringify({FileName: filename}),
            method: 'POST',
            headers: {'Content-Type': 'text/plain'}
        };

    if (!filename) {
        app_log('[HttpPostFile] filenames_list = [], Emit: drop_folder_event');
        event_obj.emit('drop_folder_event');
        return;
    }


    post_request = http.request(post_options, function (post_response) {
        app_log('[HttpPostData] post_response, post_response.statusCode = ' + post_response.statusCode);
        post_response.resume();

        if (post_response.statusCode === 200) {
            consecutive_http_failed_count = 0;
            //delete posted file;
            fs.unlink(DROP_FOLDER_PATH + filename, function (err) {
                if (err) {
                    //throw err;
                    app_log('[HttpPostData] fs.unlink ... failed, filename = ' + filename);
                } else {
                    app_log('[HttpPostData] fs.unlink ... success, filename = ' + filename);
                    event_obj.emit('HttpPostFile_event');
                }
            });
        } else {
            consecutive_http_failed_count += 1;
            if (consecutive_http_failed_count > 5) {
                //Wait 5 minutes before next attempt
                setTimeout(function () {event_obj.emit('drop_folder_event');}, 300000);
                app_log('[HttpPostData] consecutive_http_failed_count > 5, Wait 5 minutes before next attempt');
            } else {
                event_obj.emit('HttpPostFile_event');
            }
        }
    });

    post_request.on('error', function (err) {
        app_log('[HttpPostFile] hpost_request.on(\'error\' ...) ' + err.message);
        event_obj.emit('HttpPostFile_event');

    });


    if (filename) {
        app_log('[HttpPostFile] filename: ' + filename);
        read_stream = fs.createReadStream(DROP_FOLDER_PATH + filename);
        read_stream.pipe(post_request);

    }
}


event_obj.on('drop_folder_event', read_directory);
event_obj.on('HttpPostFile_event', HttpPostFile);

event_obj.emit('drop_folder_event');

app_log('[main] drop_folder_portal ..started...');
