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

import {Activities} from '../../src/activities';
import {ActivityIframePort} from '../../src/activity-iframe-port';
import {ActivityIframeHost} from '../../src/activity-iframe-host';
import {ActivityResult, ActivityResultCode} from '../../src/activity-types';
import {ActivityWindowPort} from '../../src/activity-window-port';
import {
  ActivityWindowPopupHost,
  ActivityWindowRedirectHost,
} from '../../src/activity-window-host';


describes.realWin('Activities', {}, env => {
  let win, doc;
  let activities;

  beforeEach(() => {
    win = env.win;
    doc = win.document;
    activities = new Activities(win);
  });

  describe('openIframe', () => {
    let iframe;
    let connectPromise, connectResolve, connectReject;

    beforeEach(() => {
      iframe = doc.createElement('iframe');
      doc.body.appendChild(iframe);
      connectPromise = new Promise((resolve, reject) => {
        connectResolve = resolve;
        connectReject = reject;
      });
      sandbox.stub(
          ActivityIframePort.prototype,
          'connect',
          () => connectPromise);
    });

    it('should open an iframe and connect', () => {
      const promise = activities.openIframe(
          iframe,
          'https://example.com/iframe',
          {a: 1});
      connectResolve();
      return promise.then(port => {
        expect(port).to.be.instanceof(ActivityIframePort);
        expect(port.iframe_).to.equal(iframe);
        expect(port.url_).to.equal('https://example.com/iframe');
        expect(port.targetOrigin_).to.equal('https://example.com');
        expect(port.args_).to.deep.equal({a: 1});
      });
    });

    it('should open an iframe with no args', () => {
      const promise = activities.openIframe(
          iframe,
          'https://example.com/iframe');
      connectResolve();
      return promise.then(port => {
        expect(port).to.be.instanceof(ActivityIframePort);
        expect(port.iframe_).to.equal(iframe);
        expect(port.url_).to.equal('https://example.com/iframe');
        expect(port.targetOrigin_).to.equal('https://example.com');
        expect(port.args_).to.be.null;
      });
    });

    it('should fail opening an iframe if connect fails', () => {
      const promise = activities.openIframe(
          iframe,
          'https://example.com/iframe',
          {a: 1});
      connectReject(new Error('intentional'));
      return expect(promise).to.eventually.be.rejectedWith('intentional');
    });
  });

  describe('open/onResult', () => {
    let openStub;
    let port;
    let resultPromise, resultResolver;
    let acceptResultStub;

    beforeEach(() => {
      port = null;
      openStub = sandbox.stub(ActivityWindowPort.prototype, 'open',
          function() {
            port = this;
          });
      resultPromise = new Promise(resolve => {
        resultResolver = resolve;
      });
      acceptResultStub = sandbox.stub(
          ActivityWindowPort.prototype,
          'acceptResult',
          () => resultPromise);
    });

    it('should open window', () => {
      activities.open(
          'request1',
          'https://example.com/file',
          '_blank',
          {a: 1},
          {width: 300});
      expect(openStub).to.be.calledOnce;
      expect(acceptResultStub).to.be.calledOnce;
      expect(port).to.exist;
      expect(port).to.be.instanceof(ActivityWindowPort);
      expect(port.requestId_).to.equal('request1');
      expect(port.url_).to.equal('https://example.com/file');
      expect(port.openTarget_).to.equal('_blank');
      expect(port.args_).to.deep.equal({a: 1});
      expect(port.options_).to.deep.equal({width: 300});
    });

    it('should open window with no args or options', () => {
      activities.open(
          'request1',
          'https://example.com/file',
          '_blank');
      expect(openStub).to.be.calledOnce;
      expect(acceptResultStub).to.be.calledOnce;
      expect(port.args_).to.be.null;
      expect(port.options_).to.be.null;
    });

    it('should yield onResult registered before or after popup', () => {
      const onResultSpy = sandbox.spy();
      activities.onResult('request1', onResultSpy);
      activities.open(
          'request1',
          'https://example.com/file',
          '_blank');
      expect(onResultSpy).to.not.be.called;

      // Yield result.
      const result = new ActivityResult(ActivityResultCode.OK, 'success');
      resultResolver(result);
      return resultPromise.then(() => {
        // Skip a microtask.
        return Promise.resolve();
      }).then(() => {
        expect(onResultSpy).to.be.calledOnce;
        expect(onResultSpy.args[0][0]).to.equal(port);

        // Repeat, after popup.
        activities.onResult('request1', onResultSpy);
        expect(onResultSpy).to.be.calledOnce;
        // Skip a microtask.
        return Promise.resolve();
      }).then(() => {
        expect(onResultSpy).to.be.calledTwice;
        expect(onResultSpy.args[1][0]).to.equal(port);
      });
    });

    it('should support multiple onResult', () => {
      const onResultSpy1 = sandbox.spy();
      const onResultSpy2 = sandbox.spy();
      const onResultSpy3 = sandbox.spy();
      activities.onResult('request1', onResultSpy1);
      activities.onResult('request1', onResultSpy2);
      activities.open(
          'request1',
          'https://example.com/file',
          '_blank');
      expect(onResultSpy1).to.not.be.called;
      expect(onResultSpy2).to.not.be.called;

      // Yield result.
      const result = new ActivityResult(ActivityResultCode.OK, 'success');
      resultResolver(result);
      return resultPromise.then(() => {
        // Skip a microtask.
        return Promise.resolve();
      }).then(() => {
        expect(onResultSpy1).to.be.calledOnce;
        expect(onResultSpy1.args[0][0]).to.equal(port);
        expect(onResultSpy2).to.be.calledOnce;
        expect(onResultSpy2.args[0][0]).to.equal(port);

        // Repeat, after popup.
        activities.onResult('request1', onResultSpy3);
        expect(onResultSpy3).to.not.be.called;
        // Skip a microtask.
        return Promise.resolve();
      }).then(() => {
        expect(onResultSpy1).to.be.calledOnce;
        expect(onResultSpy2).to.be.calledOnce;
        expect(onResultSpy3).to.be.calledOnce;
        expect(onResultSpy3.args[0][0]).to.equal(port);
      });
    });

    it('should tolerate callback failures', () => {
      const onResultSpy1 = function() {
        throw new Error('intentional');
      };
      const onResultSpy2 = sandbox.spy();
      activities.onResult('request1', onResultSpy1);
      activities.onResult('request1', onResultSpy2);
      activities.open(
          'request1',
          'https://example.com/file',
          '_blank');

      // Yield result.
      const result = new ActivityResult(ActivityResultCode.OK, 'success');
      resultResolver(result);
      return resultPromise.then(() => {
        // Skip a microtask.
        return Promise.resolve();
      }).then(() => {
        expect(onResultSpy2).to.be.calledOnce;
        expect(onResultSpy2.args[0][0]).to.equal(port);
      });
    });

    it('should pick up redirect result', () => {
      win.location.hash = '#__WA_RES__=' + encodeURIComponent(
          JSON.stringify({
            requestId: 'request1',
            code: 'ok',
            data: 'ok',
            origin: 'https://example.com',
          }));
      const activities = new Activities(win);

      const onResultSpy1 = sandbox.spy();
      const onResultSpy2 = sandbox.spy();
      const onResultSpy3 = sandbox.spy();
      const otherSpy = sandbox.spy();
      activities.onResult('request1', onResultSpy1);
      activities.onResult('request1', onResultSpy2);
      activities.onResult('request2', otherSpy);
      expect(onResultSpy1).to.not.be.called;
      expect(onResultSpy2).to.not.be.called;

      // Skip a microtask.
      let port;
      return Promise.resolve().then(() => {
        expect(onResultSpy1).to.be.calledOnce;
        port = onResultSpy1.args[0][0];
        expect(port).to.exist;
        expect(onResultSpy2).to.be.calledOnce;
        expect(onResultSpy2.args[0][0]).to.equal(port);

        // Repeat, after popup.
        activities.onResult('request1', onResultSpy3);
        expect(onResultSpy3).to.not.be.called;
        // Skip a microtask.
        return Promise.resolve();
      }).then(() => {
        expect(onResultSpy1).to.be.calledOnce;
        expect(onResultSpy2).to.be.calledOnce;
        expect(onResultSpy3).to.be.calledOnce;
        expect(onResultSpy3.args[0][0]).to.equal(port);
        expect(otherSpy).to.not.be.called;
      });
    });
  });

  describe('connectHost', () => {
    let initialHost;
    let connectPromise, connectResolve, connectReject;
    let popupConnectStub;

    beforeEach(() => {
      connectPromise = new Promise((resolve, reject) => {
        connectResolve = resolve;
        connectReject = reject;
      });
      sandbox.stub(
          ActivityIframeHost.prototype,
          'connect',
          function() {
            initialHost = this;
            return connectPromise;
          });
      popupConnectStub = sandbox.stub(
          ActivityWindowPopupHost.prototype,
          'connect',
          function() {
            initialHost = this;
            return connectPromise;
          });
      sandbox.stub(
          ActivityWindowRedirectHost.prototype,
          'connect',
          function() {
            initialHost = this;
            return connectPromise;
          });
    });

    it('should connect the host', () => {
      const promise = activities.connectHost();
      connectResolve(initialHost);
      return promise.then(host => {
        expect(host).to.be.instanceof(ActivityIframeHost);
      });
    });

    it('should fail if connect fails', () => {
      const promise = activities.connectHost();
      connectReject(new Error('intentional'));
      return expect(promise).to.eventually.be.rejectedWith('intentional');
    });

    describe('types of hosts', () => {
      beforeEach(() => {
        win = {
          location: {},
        };
        win.top = win;
        activities = new Activities(win);
      });

      it('should connect iframe host', () => {
        win.top = {};  // Iframe: top != this.
        const promise = activities.connectHost();
        connectResolve(initialHost);
        return promise.then(host => {
          expect(host).to.be.instanceof(ActivityIframeHost);
        });
      });

      it('should connect popup host', () => {
        win.opener = {};  // Popup: opener exists.
        const promise = activities.connectHost();
        connectResolve(initialHost);
        return promise.then(host => {
          expect(host).to.be.instanceof(ActivityWindowPopupHost);
        });
      });

      it('should connect redirect host', () => {
        win.opener = null;  // Redirect: no opener.
        const promise = activities.connectHost();
        connectResolve(initialHost);
        return promise.then(host => {
          expect(host).to.be.instanceof(ActivityWindowRedirectHost);
        });
      });

      it('should delegate to another host', () => {
        const other = {};
        win.opener = {};  // Popup: opener exists.
        const promise = activities.connectHost();
        connectResolve(other);
        return promise.then(host => {
          expect(host).to.equal(other);
        });
      });

      it('should propagate request', () => {
        const request = {};
        win.opener = {};  // Popup: opener exists.
        activities.connectHost(request);
        expect(popupConnectStub).to.be.calledOnce;
        expect(popupConnectStub).to.be.calledWith(request);
      });
    });
  });
});
