/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "index.html",
    "revision": "77e68ad496c566441ae41e8d1a99707f"
  }, {
    "url": "assets/workbox-window.prod.es5-BqEJf4Xk.js",
    "revision": null
  }, {
    "url": "assets/TelemetryPage-Twyd4PtP.css",
    "revision": null
  }, {
    "url": "assets/TelemetryPage-BJYogP0O.js",
    "revision": null
  }, {
    "url": "assets/index-ynZThzUt.js",
    "revision": null
  }, {
    "url": "assets/index-BmensOq0.css",
    "revision": null
  }, {
    "url": "favicon.svg",
    "revision": "e65b25c407bcacb7c8b22f63d8e57999"
  }, {
    "url": "icons/icon-192.png",
    "revision": "92942ed7221b256080213f5561332841"
  }, {
    "url": "icons/icon-512-maskable.png",
    "revision": "a2599a17dbb32c1093dfce8e7baccca0"
  }, {
    "url": "icons/icon-512.png",
    "revision": "aad8bef9348d3c57a678ef353e413a3e"
  }, {
    "url": "manifest.webmanifest",
    "revision": "8ee80efb93f037b0d239a68f98c6bf62"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
//# sourceMappingURL=sw.js.map
//# sourceMappingURL=sw.js.map
