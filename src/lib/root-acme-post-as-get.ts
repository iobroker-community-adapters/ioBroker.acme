/* eslint-disable */
/*
 * Restores POST-as-GET polling in ACME.js.
 *
 * The two functions below are copied verbatim from @root/acme v3.1.1 -- git tag
 * v3.1.1, commit 45fd6962f259c6399de05589848d68be42894316, upstream commit
 * 0aa939a2 "Bug fix: Polling status using POST-as-GET wherever possible" -- a
 * release that was tagged in May 2021 and never published to npm. npm serves
 * 3.1.0, whose versions of these two functions re-send requests that today's
 * Let's Encrypt rejects:
 *
 *   _postChallenge     a challenge that comes back "pending" from the trigger
 *                      POST is triggered a second time; Boulder answers the
 *                      repeat with 409, which ACME.js then misreads as a
 *                      challenge status. -> (E_STATE_UKN) challenge state '409'
 *
 *   _pollOrderStatus   on "processing" the CSR is POSTed to the finalize URL
 *                      again instead of polling the order URL as RFC 8555 §7.4
 *                      asks; Boulder answers orderNotReady, 403.
 *                      -> Didn't finalize order: Unhandled status '403'  (#49)
 *
 * Both are races, which is why the same adapter version issues certificates for
 * some users and not others.
 *
 * Do not reformat or "improve" this file. Its only virtue is being diffable
 * against upstream. It should be deleted the moment @root/acme ships a version
 * that contains the fix, or the library is replaced.
 */

import ACME from 'acme';
import U from '@root/acme/utils.js';
import E from '@root/acme/errors.js';
import Enc from '@root/encoding/bytes.js';

/** Overwrites the two functions on the shared ACME object. Idempotent. */
export function applyPostAsGetPolling(): void {
	ACME._postChallenge = function (me, options, kid, auth) {
		var RETRY_INTERVAL = me.retryInterval || 1000;
		var DEAUTH_INTERVAL = me.deauthWait || 10 * 1000;
		var MAX_POLL = me.retryPoll || 8;
		var MAX_PEND = me.retryPending || 4;
		var count = 0;
	
		var altname = ACME._untame(auth.identifier.value, auth.wildcard);
	
		/*
	   POST /acme/authz/1234 HTTP/1.1
	   Host: example.com
	   Content-Type: application/jose+json
	
	   {
	     "protected": base64url({
	       "alg": "ES256",
	       "kid": "https://example.com/acme/acct/1",
	       "nonce": "xWCM9lGbIyCgue8di6ueWQ",
	       "url": "https://example.com/acme/authz/1234"
	     }),
	     "payload": base64url({
	       "status": "deactivated"
	     }),
	     "signature": "srX9Ji7Le9bjszhu...WTFdtujObzMtZcx4"
	   }
	   */
		function deactivate() {
			//#console.debug('[ACME.js] deactivate:');
			return U._jwsRequest(me, {
				accountKey: options.accountKey,
				url: auth.url,
				protected: { kid: kid },
				payload: Enc.strToBuf(JSON.stringify({ status: 'deactivated' }))
			}).then(function (/*#resp*/) {
				//#console.debug('deactivate challenge: resp.body:');
				//#console.debug(resp.body);
				return ACME._wait(DEAUTH_INTERVAL);
			});
		}
	
		function pollStatus() {
			if (count >= MAX_POLL) {
				var err = new Error(
					"[ACME.js] stuck in bad pending/processing state for '" +
						altname +
						"'"
				);
				// Only deviation from upstream: TypeScript will not let an ad-hoc
				// property be set on Error.
				(err as any).context = 'present_challenge';
				return Promise.reject(err);
			}
	
			count += 1;
	
			//#console.debug('\n[DEBUG] statusChallenge\n');
			// POST-as-GET
			return U._jwsRequest(me, {
				accountKey: options.accountKey,
				url: auth.url,
				protected: { kid: kid },
				payload: Enc.binToBuf('')
			})
				.then(checkResult)
				.catch(transformError);
		}
	
		function checkResult(resp) {
			ACME._notify(me, options, 'challenge_status', {
				// API-locked
				status: resp.body.status,
				type: auth.type,
				altname: altname
			});
	
			// State can be pending while waiting ACME server to transition to
			// processing
			if ('pending' === resp.body.status) {
				if (count >= MAX_PEND) {
					return ACME._wait(RETRY_INTERVAL)
						.then(deactivate)
						.then(respondToChallenge);
				}
				//#console.debug('poll: again', auth.url);
				return ACME._wait(RETRY_INTERVAL).then(pollStatus);
			}
	
			if ('processing' === resp.body.status) {
				//#console.debug('poll: again', auth.url);
				return ACME._wait(RETRY_INTERVAL).then(pollStatus);
			}
	
			// REMOVE DNS records as soon as the state is non-processing
			// (valid or invalid or other)
			try {
				options.challenges[auth.type]
					.remove({ challenge: auth })
					.catch(function (err) {
						err.action = 'challenge_remove';
						err.altname = auth.altname;
						err.type = auth.type;
						ACME._notify(me, options, 'error', err);
					});
			} catch (e) {}
	
			if ('valid' === resp.body.status) {
				if (me.debug) {
					console.debug('poll: valid');
				}
	
				return resp.body;
			}
	
			var errmsg;
			if (!resp.body.status) {
				errmsg =
					"[ACME.js] (E_STATE_EMPTY) empty challenge state for '" +
					altname +
					"':" +
					JSON.stringify(resp.body);
			} else if ('invalid' === resp.body.status) {
				errmsg =
					"[ACME.js] (E_STATE_INVALID) challenge state for '" +
					altname +
					"': '" +
					//resp.body.status +
					JSON.stringify(resp.body) +
					"'";
			} else {
				errmsg =
					"[ACME.js] (E_STATE_UKN) challenge state for '" +
					altname +
					"': '" +
					resp.body.status +
					"'";
			}
	
			return Promise.reject(new Error(errmsg));
		}
	
		function transformError(e) {
			var err = e;
			if (err.urn) {
				err = new Error(
					'[acme-v2] ' +
						auth.altname +
						' status:' +
						e.status +
						' ' +
						e.detail
				);
				err.auth = auth;
				err.altname = auth.altname;
				err.type = auth.type;
				err.code =
					'invalid' === e.status ? 'E_ACME_CHALLENGE' : 'E_ACME_UNKNOWN';
			}
	
			throw err;
		}
	
		function respondToChallenge() {
			//#console.debug('[ACME.js] responding to accept challenge:');
			// POST-as-POST (empty JSON object)
			return U._jwsRequest(me, {
				accountKey: options.accountKey,
				url: auth.url,
				protected: { kid: kid },
				payload: Enc.strToBuf(JSON.stringify({}))
			})
				.then(checkResult)
				.catch(transformError);
		}
	
		return respondToChallenge();
	};
	

	ACME._pollOrderStatus = function (me, options, kid, order, verifieds) {
		var csr64 = ACME._csrToUrlBase64(options.csr);
		var body = { csr: csr64 };
		var payload = JSON.stringify(body);
	
		function processResponse(resp) {
			ACME._notify(me, options, 'certificate_status', {
				subject: options.domains[0],
				status: resp.body.status
			});
	
			// https://tools.ietf.org/html/draft-ietf-acme-acme-12#section-7.1.3
			// Possible values are: "pending" => ("invalid" || "ready") => "processing" => "valid"
			if ('valid' === resp.body.status) {
				var voucher = resp.body;
				voucher._certificateUrl = resp.body.certificate;
	
				return voucher;
			}
	
			if ('processing' === resp.body.status) {
				return ACME._wait().then(pollStatus);
			}
	
			if (me.debug) {
				console.debug(
					'Error: bad status:\n' + JSON.stringify(resp.body, null, 2)
				);
			}
	
			if ('pending' === resp.body.status) {
				return Promise.reject(
					new Error(
						"Did not finalize order: status 'pending'." +
							' Best guess: You have not accepted at least one challenge for each domain:\n' +
							"Requested: '" +
							options.domains.join(', ') +
							"'\n" +
							"Validated: '" +
							verifieds.join(', ') +
							"'\n" +
							JSON.stringify(resp.body, null, 2)
					)
				);
			}
	
			if ('invalid' === resp.body.status) {
				return Promise.reject(
					E.ORDER_INVALID(options, verifieds, resp)
				);
			}
	
			if ('ready' === resp.body.status) {
				return Promise.reject(
					E.DOUBLE_READY_ORDER(options, verifieds, resp)
				);
			}
	
			return Promise.reject(
				E.UNHANDLED_ORDER_STATUS(options, verifieds, resp)
			);
		}
	
		function pollStatus() {
			return U._jwsRequest(me, {
				accountKey: options.accountKey,
				url: order._orderUrl,
				protected: { kid: kid },
				payload: Enc.binToBuf('')
			}).then(processResponse);
		}
	
		function finalizeOrder() {
			//#console.debug('[ACME.js] pollCert:', order._finalizeUrl);
			return U._jwsRequest(me, {
				accountKey: options.accountKey,
				url: order._finalizeUrl,
				protected: { kid: kid },
				payload: Enc.strToBuf(payload)
			}).then(processResponse);
		}
	
		return finalizeOrder();
	};
}
