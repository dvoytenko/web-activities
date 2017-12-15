/**
 * @license
 * Copyright 2017 The Web Activities Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  ActivityHostDef,
  ActivityOpenOptionsDef,
  ActivityPortDef,
  ActivityRequestDef,
} from './activity-types';
import {ActivityIframeHost} from './activity-iframe-host';
import {ActivityIframePort} from './activity-iframe-port';
import {
  ActivityWindowPopupHost,
  ActivityWindowRedirectHost,
} from './activity-window-host';
import {
  ActivityWindowPort,
  discoverRedirectPort,
} from './activity-window-port';


/**
 * The page-level activities manager. This class is intended to be used as a
 * singleton. It can start activities as well as implement them.
 */
export class Activities {

  /**
   * @param {!Window} win
   */
  constructor(win) {
    /** @private @const {!Window} */
    this.win_ = win;

    /** @private @const {string} */
    this.fragment_ = win.location.hash;

    /**
     * @private @const {!Object<string, !Array<function(!ActivityPortDef)>>}
     */
    this.requestHandlers_ = {};

    /**
     * The result buffer is indexed by `requestId`.
     * @private @const {!Object<string, !ActivityPortDef>}
     */
    this.resultBuffer_ = {};
  }

  /**
   * Start an activity within the specified iframe.
   * @param {!HTMLIFrameElement} iframe
   * @param {string} url
   * @param {?Object=} opt_args
   * @return {!Promise<!ActivityIframePort>}
   */
  openIframe(iframe, url, opt_args) {
    const port = new ActivityIframePort(iframe, url, opt_args);
    return port.connect().then(() => port);
  }

  /**
   * Start an activity in a separate window. The result will be delivered
   * to the `onResult` callback.
   *
   * The activity can be opened in two modes: "popup" and "redirect". This
   * depends on the `target` value, but also on the browser/environment.
   *
   * The allowed `target` values are `_blank`, `_top` and name targets. The
   * `_self`, `_parent` and similar targets are not allowed.
   *
   * The `_top` target indicates that the activity should be opened as a
   * "redirect", while other targets indicate that the activity should be
   * opened as a popup. The activity client will try to honor the requested
   * target. However, it's not always possible. Some environments do not
   * allow popups and they either force redirect or fail the window open
   * request. In this case, the activity will try to fallback to the "redirect"
   * mode.
   *
   * @param {string} requestId
   * @param {string} url
   * @param {string} target
   * @param {?Object=} opt_args
   * @param {?ActivityOpenOptionsDef=} opt_options
   */
  open(requestId, url, target, opt_args, opt_options) {
    const port = new ActivityWindowPort(
        this.win_, requestId, url, target, opt_args, opt_options);
    port.open();
    // Await result if possible. Notice that when falling back to "redirect",
    // the result will never arrive through this port.
    port.acceptResult().then(() => {
      this.consumeResultAll_(requestId, port);
    });
  }

  /**
   * Registers the callback for the result of the activity opened with the
   * specified `requestId` (see the `open()` method). The callback is a
   * function that takes a single `ActivityPortDef` argument. The client
   * can use this object to verify the port using it's origin, verified and
   * secure channel flags. Then the client can call
   * `ActivityPortDef.acceptResult()` method to accept the result.
   *
   * The activity result is handled via a separate callback because of a
   * possible redirect. So use of direct callbacks and/or promises is not
   * possible in that case.
   *
   * A typical implementation would look like:
   * ```
   * activities.onResult('request1', function(port) {
   *   // Only verified origins are allowed.
   *   if (port.getTargetOrigin() == expectedOrigin &&
   *       port.isTargetOriginVerified() &&
   *       port.isSecureChannel()) {
   *     port.acceptResult().then(function(result) {
   *       handleResultForRequest1(result);
   *     });
   *   }
   * })
   *
   * activties.open('request1', request1Url, '_blank');
   * ```
   *
   * @param {string} requestId
   * @param {function(!ActivityPortDef)} callback
   */
  onResult(requestId, callback) {
    let handlers = this.requestHandlers_[requestId];
    if (!handlers) {
      handlers = [];
      this.requestHandlers_[requestId] = handlers;
    }
    handlers.push(callback);

    // Consume available result.
    const availableResult = this.discoverResult_(requestId);
    if (availableResult) {
      this.consumeResult_(availableResult, callback);
    }
  }

  /**
   * Start activity implementation handler (host).
   * @param {(?ActivityRequestDef|?string)=} opt_request
   * @return {!Promise<!ActivityHostDef>}
   */
  connectHost(opt_request) {
    let host;
    if (this.win_.top != this.win_) {
      // Iframe host.
      host = new ActivityIframeHost(this.win_);
    } else if (this.win_.opener && !this.win_.opener.closed) {
      // Window host: popup.
      host = new ActivityWindowPopupHost(this.win_);
    } else {
      // Window host: redirect.
      host = new ActivityWindowRedirectHost(this.win_);
    }
    return host.connect(opt_request);
  }

  /**
   * @param {string} requestId
   * @return {?ActivityPortDef}
   * @private
   */
  discoverResult_(requestId) {
    let port = this.resultBuffer_[requestId];
    if (!port && this.fragment_) {
      port = discoverRedirectPort(
          this.win_, this.fragment_, requestId);
      if (port) {
        this.resultBuffer_[requestId] = port;
      }
    }
    return port;
  }

  /**
   * @param {!ActivityPortDef} port
   * @param {function(!ActivityPortDef)} callback
   * @private
   */
  consumeResult_(port, callback) {
    Promise.resolve().then(() => {
      callback(port);
    });
  }

  /**
   * @param {string} requestId
   * @param {!ActivityPortDef} port
   * @private
   */
  consumeResultAll_(requestId, port) {
    // Find and execute handlers.
    const handlers = this.requestHandlers_[requestId];
    if (handlers) {
      handlers.forEach(handler => {
        this.consumeResult_(port, handler);
      });
    }
    // Buffer the result for callbacks that may arrive in the future.
    this.resultBuffer_[requestId] = port;
  }
}
