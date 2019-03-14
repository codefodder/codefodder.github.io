(function(window) {
    var GithubApi = {
        xhr: null,
        apiBaseUrl: 'https://api.github.com',
        getXMLHttpRequest: function () {
            if (!!window.XMLHttpRequest) {
                this.xhr = new window.XMLHttpRequest;
            }
            else {
                try {
                    this.xhr = new ActiveXObject("MSXML2.XMLHTTP.3.0");
                } catch (e) {
                    this.xhr = null;
                }
            }

            if (!this.xhr) {
                window.console.log("AJAX (XMLHTTP) not supported by your client.");
            }
        },
        get: function (endpoint, success, failure) {
            this.getXMLHttpRequest();

            var self = this.xhr,
                requestUrl = this.apiBaseUrl + endpoint;

            this.xhr.open('GET', requestUrl, true);
            this.xhr.setRequestHeader('Accept', 'application/json');

            self.onload = function() {
                if (self.status >= 200 && self.status < 400) {
                    window.console.log('Successfully called ' + requestUrl);
                    try {
                        var json = JSON.parse(self.responseText);
                    } catch (e) {
                        window.console.log('Error parsing response as JSON. Returning raw response data.');
                    }

                    var response = !json ? self.responseText : json;

                    success(response);
                }
                else {
                    window.console.log('Error requesting ' + requestUrl +
                        '. Response Status-Code is ' + self.status);
                    failure();
                }
            }
            self.onerror = function() {
                window.console.log('There was an error (of some sort) connecting to ' + requestUrl);
                failure();
            };

            this.xhr.send();
        },
        getGist: function(gistId, success, failure) {
            var url = '/gists/' + gistId;
            this.get(url, success, failure);
        },
        getGistComments: function(gistId, success, failure) {
            var url = '/gists/' + gistId + '/comments';
            this.get(url, success, failure);
        }
    };

    window.GithubApi = GithubApi;
})(window);

var handleLinks = function() {
    for(var c = document.getElementsByTagName("a"), a = 0; a < c.length; a++) {
        var b = c[a];
        if (b.getAttribute("href") && b.getAttribute("href")[0] === '#') {
            // attach smooth scrooling to internal anchor links
            b.addEventListener('click', function(e) {
                e.preventDefault();
                if (e.target.hash) {
                    scrollToElem(e.target.hash);
                    history.pushState(null, null, e.target.hash);
                }
            });
        } else if (b.getAttribute("href") && b.hostname !== location.hostname) {
            // open external links in new tab
            b.target = "_blank";
        }
    }
};

var hideLoadingIndicator = function() {
    document.querySelector('#loadingIndicator').style.display = 'none';
};

var showFooter = function(elemId) {
    document.querySelector('#' + elemId).style.display = 'block';
};

var parseQueryString = (function(pairList) {
    var pairs = {};
    for (var i = 0; i < pairList.length; ++i) {
        var keyValue = pairList[i].split('=', 2);
        if (keyValue.length == 1) {
            pairs[keyValue[0]] = '';
        } else {
            pairs[keyValue[0]] = decodeURIComponent(keyValue[1].replace(/\+/g, ' '));
        }
    }
    return pairs;
})(window.location.search.substr(1).split('&'));

// Since we can not access the iframe to get its scroll height (cross origin),
// we calculate the height by counting the lines in the embedded gist.
// Ugly, but works reliable.
var getIframeHeight = function(filename) {
    for (var n in files.others) {
        if (files.others[n].filename === filename) {
            var matches = files.others[n].content.match(/\n/g);
            var lines = ((matches && matches.length) ? matches.length : 0) + 1;
            // 22px = line height in embedded gists (with .pibb extension)
            // 40px = embedded gists footer height
            // 3px = cumulated border height for embedded gists
            // 8px = body margin for embedded gists
            return (lines * 22) + 40 + 3 + 8;
        }
    }
    return false;
};

// smooth anchor scrolling
var smoothScrollTo = function(elem) {
    window.scroll({
        behavior: 'smooth',
        left: 0,
        top: elem.getBoundingClientRect().top + window.scrollY
    });
};
// not-so-smooth anchor scrolling for IE
var jankyScrollTo = function(element, to, duration) {
    if (duration <= 0) return;
    var difference = to - element.scrollTop;
    var perTick = difference / duration * 10;

    setTimeout(function() {
        element.scrollTop = element.scrollTop + perTick;
        if (element.scrollTop === to) return;
        jankyScrollTo(element, to, duration - 10);
    }, 10);
};

var scrollToElem = function(elemSelector) {
    var elem = document.querySelector(elemSelector);
    if (elem) {
        if (!isIE) {
            smoothScrollTo(elem);
        } else {
            var root = document.documentElement || document.body;
            jankyScrollTo(root, elem.offsetTop, 600);
        }
    }
};

var addAuthor = function(gist) {
    document.querySelector('#gistAuthor').innerHTML = '<a href="' + gist.owner.html_url + '">@' + gist.owner.login + '</a>';
    document.querySelector('#gistPubDate').textContent = gist.created_at;
    document.querySelector('#authorHolder').style.display = 'block';
};

var loadGist = function(gistId) {
    GithubApi.getGist(gistId, function(gist) {
        if (gist) {
            console.dir(gist);
            hideLoadingIndicator();

            if (gist.id && gist.id.length) {
                // use gist description as a document title / headline
                if (gist.description.length) {
                    $titleHolder.textContent = gist.description;
                    document.title = gist.description;
                } else {
                    $titleHolder.textContent = 'Untitled document';
                }

                // get all markdown files to be parsed
                for (var n in gist.files) {
                    if (gist.files[n].language === 'Markdown') {
                        files.markdown.push(gist.files[n]);
                    } else {
                        files.others.push(gist.files[n]);
                    }
                }

                // parse markdown files
                if (files.markdown.length) {
                    var html = '';
                    var md = window.markdownit({linkify: true});
                    md.use(window.markdownItAnchor, {
                        level: 1,
                        permalink: true,
                        permalinkClass: 'header-anchor',
                        permalinkSymbol: '¶',
                        permalinkBefore: true
                    });

                    for (var i in files.markdown) {
                        html += md.render(files.markdown[i].content);
                    }

                    // do we need to embed other gists?
                    var matches = html.match(/&lt;gist&gt;(.*?)&lt;\/gist&gt;/gi);
                    if (matches && matches.length) {
                        for (var x in matches) {
                            var filename = matches[x].replace('&lt;gist&gt;', '').replace('&lt;/gist&gt;', '');
                            var h = getIframeHeight(filename);
                            if (h !== false) {
                                html = html.replace(matches[x], '<iframe class="embedded-gist" style="height:' + h + 'px" src="https://gist.github.com/' + gistId + '.pibb?file=' + filename + '" scrolling="no"></iframe>');
                            }
                        }
                    }

                    // write gist content
                    $contentHolder.innerHTML = html;

                    // add author details
                    if (!isHomepage) {
                        addAuthor(gist);
                    }

                    // add link to gist comment section, if we have comments
                    if (!isHomepage && gist.comments > 0) {
                        // var commentsHTML = '';
                        // GithubApi.getGistComments(gistId, function(comments) {
                        //     if (comments && comments.length) {
                        //         for (var m in comments) {
                        //             var commentHTML = md.render(comments[m].body);
                        //             console.log(commentHTML);
                        //         }
                        //     }
                        // }, function(error) {
                        //     console.warn(error);
                        // });
                        document.querySelector('#gistComments').innerHTML = '<a target="_blank" href="https://gist.github.com/' + gistId + '#comments">' + gist.comments + ' comments</a>';
                    }

                    // add syntax highlighting to code blocks
                    var codeBlocks = document.querySelectorAll('pre');
                    for (var c in codeBlocks) {
                        try {
                            hljs.highlightBlock(codeBlocks[c]);
                        } catch(e) {}
                    }

                    // open external links in new tab and
                    // attach smooth scrolling to internal anchor links
                    handleLinks();

                    // smooth-scroll to anchor
                    if (location.hash.length) {
                        setTimeout(function() {
                            scrollToElem(location.hash);
                        }, 200);
                    }
                } else {
                    $contentHolder.textContent = 'No markdown files attached to gist ' + gistId;
                }
            }
        }
    }, function(error) {
        console.warn(error);
        hideLoadingIndicator();
        $titleHolder.textContent = 'Error fetching gist.'
    });
};

var init = function(gistId) {
    if (typeof gistId === 'undefined' || gistId === '') {
        isHomepage = true;
        loadGist('7442b083383908d7c925981ff082fea7');
        showFooter('footerIntro');
    } else {
        loadGist(gistId);
        showFooter('footerPost');
    }
};

var $titleHolder = document.querySelector('#titleHolder'),
    $contentHolder = document.querySelector('#gistContent'),
    isIE = /Trident|MSIE/.test(navigator.userAgent),
    isHomepage = false,
    gistId = '',
    files = {
        markdown: [],
        others: []
    };

(function() {
    var redirect = sessionStorage.redirect;
    delete sessionStorage.redirect;

    if (redirect && redirect !== location.href) {
        history.replaceState(null, null, redirect);
        gistId = redirect.split('/').pop().split('#', 1); // redirected via 404 page hack
    } else {
        gistId = parseQueryString['id']; // direct entry
    }

    init(gistId);
})();

window.onhashchange = function() {
    scrollToElem(location.hash);
};
