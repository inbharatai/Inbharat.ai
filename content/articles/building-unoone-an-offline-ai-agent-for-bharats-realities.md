> **Content correction — 16 November 2026:** Historical Android development article first published 14 July 2026. UnoOne now denotes the PAI ecosystem: Power (Windows) and Mobile (Android). Model names and architecture here record that development account, not a current qualified-device specification. Current Mobile planner activation, migrations and language/device coverage remain under validation. Sensitive-action wording is corrected below.

# Building UnoOne Mobile: A Historical Android Development Note

When I started InBharat.ai, my goal was clear: build AI that works for India's realities. That means AI that doesn't demand perfect internet, isn't English-only, and respects privacy and cost. UnoOne is my answer to that challenge.

This article’s Android project is now described as UnoOne Mobile, an offline-first Android AI agent, built from the ground up for Bharat. It combines local reasoning, offline voice, secure smartphone control, private memory, and a unique feature I call 'Blind Vision' for visually impaired users. This isn't just another chatbot; it's an AI agent designed to live on your phone, understand instructions, 'see' through the camera, speak back, and operate approved smartphone functions without constant cloud dependence.

## Why UnoOne Matters for Bharat

For millions across India, the smartphone is their primary, often only, computer. Yet, most AI assistants today are cloud-dependent, process personal data remotely, and offer limited direct control over the device. Accessibility is often an afterthought, not a core design principle.

UnoOne addresses these gaps by integrating:

*   **Local AI Planning:** The historical development account named Gemma 4 E2B through LiteRT-LM; the current activation path remains under device validation.
*   **Offline Voice:** Speech recognition and responses that work without internet.
*   **Smartphone Control:** Safe interaction with Android apps and system functions.
*   **Blind Vision:** Camera-based assistance for text and object recognition.
*   **Private Local Memory:** Notes, preferences, and task outcomes stored securely on the device.
*   **Secure Browser Assistance:** Gated help for web tasks, prioritizing user safety.

Our design principle is clear: the AI suggests, but UnoOne's safety system decides what actions are permitted. This is intended to support user control and data privacy, a critical concern for many Indian users. We've seen how important data privacy is, especially with tool-use risk controls such as JAK Shield, where trust is paramount.

## The Historical Model Plan: Gemma Through LiteRT-LM

The July development account described Google Gemma 4 E2B through LiteRT-LM as its intended local planning engine; this is not a current benchmark or compatibility promise. Simple commands are handled by fixed rules; complex instructions go to Gemma for structured planning. The intended benefit was to keep simple commands bounded while evaluating model-assisted plans separately.

Here's how it works:

1.  **User Input:** Voice or touch.
2.  **UnoOne Agent Orchestrator:** Directs the request.
3.  **Rule-based Processing / Gemma Planning:** Decides the best approach.
4.  **Approved Tool Registry:** Maps to allowed phone actions.
5.  **Safety & Permission Checks:** Crucial human-gated layer.
6.  **Action:** On phone, memory, vision, or browser.

Running intelligence locally significantly reduces reliance on internet connectivity, enhances privacy, and cuts cloud inference costs. It also allows tighter integration with Android. Of course, on-device AI brings its own challenges: memory usage, battery consumption, device heating, and hardware compatibility. This is why rigorous physical device testing is non-negotiable for us at InBharat.

## Blind Vision: Seeing Through the Camera

Blind Vision is a cornerstone of UnoOne's accessibility features. It's designed to help blind and visually impaired users understand their surroundings through the smartphone camera. It combines CameraX, on-device object detection, OCR, spoken guidance, haptic feedback, and Android accessibility services.

Imagine pointing your phone at a sign or a document. Camera/OCR output can be wrong and must not be relied on for medication decisions, hazard detection or navigation safety. UnoOne processes what the camera sees and provides information via speech and vibration. This capability is intended to assist with:

*   Detecting objects in the environment.
*   Reading printed text on labels and documents.
*   Identifying text on product packaging.
*   Providing spoken descriptions and haptic confirmations.
*   Supporting phone navigation by reading visible screen text.

Crucially, the camera, OCR, and object-detection functions operate independently of the main Gemma model. Essential visual assistance should not fail just because the larger language model is busy or unavailable. This modularity is key to reliability, similar to how we design our Sahayaak Seva tools for field assistance, where uptime is critical.

## Offline Voice and Indian Languages

Voice is central to UnoOne. Typing shouldn't be the only way to interact with an AI agent. Our architecture includes robust offline speech-to-text and text-to-speech capabilities. We're prioritizing support for English, Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, and Assamese.

I won't claim full language support until we've thoroughly tested recognition and spoken output on physical devices, accounting for diverse Indian accents, background noise, names, numbers, and code-mixed speech. Real-world performance is what matters.

## Safe Smartphone Control and Secure Browser Assistance

UnoOne is designed to use approved Android intents and accessibility actions to help users with tasks like:

*   Opening applications and reading visible screen text.
*   Tapping approved interface elements and entering non-sensitive text.
*   Scrolling, swiping, and navigating complex interfaces.

Because accessibility permissions are powerful, UnoOne never allows unrestricted device control. Every action passes through our approved tool registry and safety layer. The user is always aware of what UnoOne is attempting and can confirm or deny actions.

Similarly, our browser assistant is safety-gated. It supports approved HTTPS domains and requires native authorization. Payment, OTP, password-entry and auto-send actions are blocked for the agent, not unlocked by confirmation. A person must complete sensitive steps manually outside the agent. CAPTCHA challenges are likewise for the person, not automated bypass. Desktop confirmation-gated form uploads are a separate capability and do not establish Android upload support. These boundaries must be tested in the actual build; they are not evidence of separate TestsPrep security certification.

## Private Local Memory: You Are Not The Product

UnoOne stores notes, preferences, skills, diagnostics, and task outcomes locally on the device. Over time, this helps it remember frequently used apps, preferred responses, repeated tasks, and accessibility needs. The user always has full control to inspect, edit, and delete this memory.

A personal AI agent should work for the user. The user should never become the product. This is a core tenet of InBharat.ai.

## Current Development Status

The original article described UnoOne V2 as a development build; the current product is an Android alpha. The historical build account listed Kotlin/Jetpack Compose, a Gemma planning path, rule-based processing, a controlled tool registry, local memory, speech and accessibility foundations. Those implementation entries are not equivalent to current device qualification. The current shared product page reports internal automated test results separately from physical-device qualification.

However, it's not a finished consumer product. Remaining work includes extensive physical-device qualification, Gemma performance testing, battery and thermal measurement, speech benchmarking, Assamese language qualification, Blind Vision testing with real users, browser-security validation, and preparing for signed public releases.

## Bottom Line

Bharat needs AI that truly understands and adapts to its unique conditions – beyond fast networks and English-only interfaces. UnoOne is my commitment to building an AI agent that sees through Blind Vision, listens through offline voice, reasons with Gemma, remembers locally, and operates approved phone functions safely. It's an agent built for the realities of India, putting the user in control, always.

**FAQ**

**Q: What makes UnoOne different from other AI assistants?**
A: The Android work now called UnoOne Mobile is designed for local planning, Indian language needs and accessibility, including its proposed 'Blind Vision' accessibility feature for visually impaired users. Most assistants are cloud-dependent and less integrated with device control.

**Q: How does UnoOne ensure user privacy?**
A: The design stores personal memory locally and implements on-device planning. Current Mobile planner activation and device migrations remain under validation; see the Mobile capability page. Payment, OTP, password-entry and auto-send are blocked agent actions. The user completes such steps manually outside the agent. Optional online research and external app actions can transmit permitted data; local memory is not a no-network guarantee.

**Q: When will UnoOne be available to the public?**
A: UnoOne Mobile is an Android alpha with no public installer. Device, language and accessibility validation remain open; this article does not establish completed user studies. We are working towards a public release, but our priority is ensuring stability, safety, and accuracy for Bharat's diverse needs.

#UnoOne #InBharatAI #Gemma4 #GoogleAI #LiteRTLM #OfflineAI #BlindVision #AccessibilityAI #AIForBharat