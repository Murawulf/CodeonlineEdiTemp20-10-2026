'use strict';

/**
 * generateAperakEANCOM.js
 * 
 * Generates an EANCOM D.96A APERAK message (Application Error and Acknowledgement)
 * conforming to the GS1 standard.
 * 
 * BGM+313 = Positive acknowledgement (ACK)
 * BGM+314 = Negative acknowledgement / rejection (NACK)
 * 
 * Architecture: This module lives in the ORCHESTRATOR only.
 * The orchestrator is the sole entity responsible for generating and routing APERAK messages.
 * Nodes (buyer/supplier) never generate APERAK directly — they only POST an ACK/NACK to the hub.
 */

/**
 * Escape special EANCOM characters in a field value.
 * EANCOM release character is '?' before ':', '+', ''', '?'
 */
function escapeEancom(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\?/g, '??')
    .replace(/'/g, "?'")
    .replace(/\+/g, '?+')
    .replace(/:/g, '?:');
}

/**
 * Format a Date object to EANCOM date string (YYYYMMDD)
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Format a Date object to EANCOM time string (HHMM)
 */
function formatTime(date) {
  const d = date instanceof Date ? date : new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}${mm}`;
}

/**
 * Generate a sequential interchange control reference (ICR).
 * Simple timestamp-based for uniqueness.
 */
function generateIcr() {
  return String(Date.now()).slice(-9);
}

/**
 * Generate an APERAK EANCOM D.96A message.
 *
 * @param {Object} options
 * @param {string} options.originalRef      - Document reference of the original message (e.g. invoice number)
 * @param {string} options.originalMsgType  - Type of the acknowledged message, e.g. 'INVOIC' (default)
 * @param {string} options.senderGln        - GLN of the APERAK sender (= the buyer who received the invoice)
 * @param {string} options.receiverGln      - GLN of the APERAK receiver (= the supplier who sent the invoice)
 * @param {'ACK'|'NACK'} options.aperakType - 'ACK' = positive (BGM+313), 'NACK' = negative (BGM+314)
 * @param {string} [options.errorCode]      - EDIFACT error code (required when aperakType = 'NACK')
 * @param {string} [options.errorText]      - Human-readable error description (optional)
 * @returns {string} The full EANCOM APERAK message string
 */
function generateAperakEANCOM({
  originalRef,
  originalMsgType = 'INVOIC',
  senderGln,
  receiverGln,
  aperakType = 'ACK',
  errorCode = null,
  errorText = null,
}) {
  if (!originalRef) throw new Error('[generateAperakEANCOM] originalRef is required');
  if (!senderGln)   throw new Error('[generateAperakEANCOM] senderGln is required');
  if (!receiverGln) throw new Error('[generateAperakEANCOM] receiverGln is required');

  const now = new Date();
  const icr = generateIcr();
  const msgRef = `APK${icr}`;
  
  // BGM function code: 313 = Acknowledgement, 314 = Rejection/NACK
  const bgmFunctionCode = aperakType === 'NACK' ? '314' : '313';

  const segments = [];

  // ─── Interchange Envelope ────────────────────────────────────────────────
  // UNB: Interchange Control Header
  // SYNTAX_IDENTIFIER:VERSION  SENDER  RECEIVER  DATE+TIME  ICR
  segments.push(
    `UNB+UNOB:1+${escapeEancom(senderGln)}:14+${escapeEancom(receiverGln)}:14+${formatDate(now)}:${formatTime(now)}+${icr}`
  );

  // ─── Message Envelope ────────────────────────────────────────────────────
  // UNH: Message Header
  // MSGREF  MSGTYPE:VERSION:RELEASE:CONTROLLINGAGENCY
  segments.push(
    `UNH+${msgRef}+APERAK:D:96A:UN:EAN008`
  );

  // ─── Head Section ────────────────────────────────────────────────────────
  // BGM: Beginning of Message
  // MSGTYPE  DOCNUMBER  FUNCTIONCODE
  segments.push(
    `BGM+${bgmFunctionCode}+${escapeEancom(msgRef)}`
  );

  // DTM: Date/Time — Message creation date (137 = Document/message date/time)
  segments.push(
    `DTM+137:${formatDate(now)}:102`
  );

  // ─── Reference Section ───────────────────────────────────────────────────
  // RFF: Reference to original message
  // ACE = Reference to the applicable message
  segments.push(
    `RFF+ACE:${escapeEancom(originalRef)}`
  );

  // DOC: Referenced document (optional but useful for GS1 compliance)
  // 131 = Reference document (the acknowledged message type)
  segments.push(
    `DOC+131:${escapeEancom(originalMsgType)}`
  );

  // ─── Party Section ───────────────────────────────────────────────────────
  // NAD+MS: Message Sender (buyer, confirming receipt)
  segments.push(
    `NAD+MS+${escapeEancom(senderGln)}::9`
  );

  // NAD+MR: Message Receiver (supplier, original sender of the invoice)
  segments.push(
    `NAD+MR+${escapeEancom(receiverGln)}::9`
  );

  // ─── Error Section (only for NACK) ───────────────────────────────────────
  if (aperakType === 'NACK' && errorCode) {
    // ERC: Application Error Information
    // errorCode should be a standard EDIFACT/GS1 error code
    segments.push(
      `ERC+${escapeEancom(errorCode)}`
    );

    if (errorText) {
      // FTX: Free Text — human-readable error description
      // AAO = Error description (or ZZZ for mutually defined)
      segments.push(
        `FTX+AAO+++${escapeEancom(errorText)}`
      );
    }
  }

  // ─── Segment count for UNT ───────────────────────────────────────────────
  // UNT counts all segments between UNH and UNT inclusive
  const segmentCount = segments.length; // we add UNT last

  // UNT: Message Trailer — SEGCOUNT  MSGREF
  segments.push(
    `UNT+${segmentCount + 1}+${msgRef}`
  );

  // UNZ: Interchange Trailer — MSGCOUNT  ICR
  segments.push(
    `UNZ+1+${icr}`
  );

  // EANCOM uses single quote (') as segment terminator
  return segments.join("'") + "'";
}

module.exports = { generateAperakEANCOM };
