# Building UnoOne: An Offline AI Agent for Bharat

When I started InBharat.ai, my goal was clear: build AI that works for India's realities. That means AI that doesn't demand perfect internet, isn't English-only, and respects privacy and cost. UnoOne is my answer to that challenge.

UnoOne is an offline-first Android AI agent, built from the ground up for Bharat. It combines local reasoning, offline voice, secure smartphone control, private memory, and a unique feature I call 'Blind Vision' for visually impaired users. This isn't just another chatbot; it's an AI agent designed to live on your phone, understand instructions, 'see' through the camera, speak back, and operate approved smartphone functions without constant cloud dependence.

## Why UnoOne Matters for Bharat

For millions across India, the smartphone is their primary, often only, computer. Yet, most AI assistants today are cloud-dependent, process personal data remotely, and offer limited direct control over the device. Accessibility is often an afterthought, not a core design principle.

UnoOne addresses these gaps by integrating:

*   **Local AI Planning:** Powered by Google Gemma 4 E2B for on-device intelligence.
*   **Offline Voice:** Speech recognition and responses that work without internet.
*   **Smartphone Control:** Safe interaction with Android apps and system functions.
*   **Blind Vision:** Camera-based assistance for text and object recognition.
*   **Private Local Memory:** Notes, preferences, and task outcomes stored securely on the device.
*   **Secure Browser Assistance:** Gated help for web tasks, prioritizing user safety.

Our design principle is clear: the AI suggests, but UnoOne's safety system decides what actions are permitted. This ensures user control and data privacy, a critical concern for many Indian users. We've seen how important data privacy is, especially with tools like our JAK Shield for scam detection, where trust is paramount.

## Powered by Google Gemma 4 E2B, On-Device

UnoOne V2 uses Google Gemma 4 E2B, running through LiteRT-LM, as its core local planning engine. Simple commands are handled by fixed rules; complex instructions go to Gemma for structured planning. This hybrid approach ensures efficiency and robustness.

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

Imagine pointing your phone at a sign, a medicine label, or a document. UnoOne processes what the camera sees and provides information via speech and vibration. This capability is intended to assist with:

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

Similarly, our browser assistant is safety-gated. It supports approved HTTPS domains and requires native authorization. Sensitive actions like payments, password entry, OTPs, CAPTCHA completion, and uploads always require manual user confirmation. UnoOne assists, but sensitive authority always remains with the user. This approach mirrors the security-first mindset we apply to our TestsPrep platform for exam security, ensuring integrity and trust.

## Private Local Memory: You Are Not The Product

UnoOne stores notes, preferences, skills, diagnostics, and task outcomes locally on the device. Over time, this helps it remember frequently used apps, preferred responses, repeated tasks, and accessibility needs. The user always has full control to inspect, edit, and delete this memory.

A personal AI agent should work for the user. The user should never become the product. This is a core tenet of InBharat.ai.

## Current Development Status

UnoOne V2 is a working development build. It features a native Kotlin and Jetpack Compose Android architecture, Gemma 4 E2B planning, rule-based command processing, a controlled tool registry, safety validation, local memory, offline speech, Blind Vision foundations, and secure browser architecture. Our automated Android and distribution pipelines are passing.

However, it's not a finished consumer product. Remaining work includes extensive physical-device qualification, Gemma performance testing, battery and thermal measurement, speech benchmarking, Assamese language qualification, Blind Vision testing with real users, browser-security validation, and preparing for signed public releases.

## Bottom Line

Bharat needs AI that truly understands and adapts to its unique conditions – beyond fast networks and English-only interfaces. UnoOne is my commitment to building an AI agent that sees through Blind Vision, listens through offline voice, reasons with Gemma, remembers locally, and operates approved phone functions safely. It's an agent built for the realities of India, putting the user in control, always.

**FAQ**

**Q: What makes UnoOne different from other AI assistants?**
A: UnoOne is offline-first, designed for Indian languages and network conditions, and prioritizes on-device privacy and accessibility, especially with its unique 'Blind Vision' feature for visually impaired users. Most assistants are cloud-dependent and less integrated with device control.

**Q: How does UnoOne ensure user privacy?**
A: All personal memory, notes, and preferences are stored locally on the device. Critical AI planning also happens on-device with Gemma. Sensitive actions like payments or password entry are always human-gated and require explicit user confirmation, ensuring data never leaves your phone without your consent.

**Q: When will UnoOne be available to the public?**
A: UnoOne is currently in active development and undergoing rigorous physical device testing, performance benchmarking, and user validation, especially for Blind Vision and language support. We are working towards a public release, but our priority is ensuring stability, safety, and accuracy for Bharat's diverse needs.

#UnoOne #InBharatAI #Gemma4 #GoogleAI #LiteRTLM #OfflineAI #BlindVision #AccessibilityAI #AIForBharat