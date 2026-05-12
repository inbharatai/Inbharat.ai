// One-shot: remove orphan locale keys + add FAQ/nav keys across all 11 locales.
// Run with: node scripts/update-locales.mjs   (idempotent — safe to re-run.)
//
// After this script does its job once, you can delete it. We keep it in the
// repo so the change is auditable.

import fs from 'node:fs/promises';
import path from 'node:path';

const LOCALES_DIR = path.resolve('locales');

const ORPHAN_KEYS = [
  // "sovereign" wording — feedback rule: never use this word.
  'sovereignty',
  'sovereignStack',
  'sovereignStackDesc',
  'inBharatSovereign',
  'inBharatSovereignDesc',
  'inBharatSovereignFeature',
  // AI-agents showcase copy — feedback rule: landing should not feature an
  // agents section. These keys are not referenced by any component.
  'landNavAgents',
  'landAgentsLabel',
  'landAgentsTitle',
  'landAgentsDesc',
  'landAgentStandard',
  'landAgentResearcher',
  'landAgentCoder',
  'landAgentEducator',
  'landAgentBrowser',
  'landAgentExecutive',
  'landAgentShopper',
  'landActivityLabel',
  // Orphan: not referenced anywhere in code (verified via grep).
  'agenticSearch',
  'agenticSearchDesc',
  'inBharatSearch',
  'inBharatAgentic',
];

// Per-language additions. Each entry must define every NEW_KEYS key.
const NEW_KEYS = {
  en: {
    landFaqLabel: 'Questions, answered',
    landFaqTitle: 'Frequently asked questions',
    landFaqDesc: 'The basics, in plain language. If you need more, the contact page is one tap away.',
    faqQ1: 'What is InBharat AI?',
    faqA1: 'InBharat AI is an independent AI product studio building affordable, voice-first, multilingual AI tools for India — including agentic search, coding assistants, education platforms, and business automation.',
    faqQ2: 'Which Indian languages does InBharat AI support?',
    faqA2: 'Eleven languages today: English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Odia, and Assamese.',
    faqQ3: 'Is InBharat AI free to try?',
    faqA3: 'Yes. You get a few free messages on the InBharat AI console before signing in. No credit card required.',
    faqQ4: 'Do I need to install anything?',
    faqA4: 'No. InBharat AI runs in your browser on any modern device — phone, tablet, or laptop.',
    faqQ5: 'Does InBharat AI work on mobile?',
    faqA5: 'Yes. The site and the InBharat AI console are designed mobile-first and work on phones, tablets, and desktops.',
    faqQ6: 'How do I contact the team?',
    faqA6: 'Email us, or reach out on LinkedIn, X, Instagram, or GitHub. All channels are listed on the contact page.',
    navAbout: 'About',
    navContact: 'Contact',
    navPrivacy: 'Privacy',
    navTerms: 'Terms',
  },
  hi: {
    landFaqLabel: 'जवाबों के साथ सवाल',
    landFaqTitle: 'अक्सर पूछे जाने वाले प्रश्न',
    landFaqDesc: 'सरल भाषा में आधारभूत जानकारी। और जानकारी चाहिए तो संपर्क पृष्ठ एक क्लिक दूर है।',
    faqQ1: 'InBharat AI क्या है?',
    faqA1: 'InBharat AI एक स्वतंत्र AI प्रोडक्ट स्टूडियो है जो भारत के लिए किफायती, वॉइस-फर्स्ट, बहुभाषी AI टूल बनाता है — एजेंटिक सर्च, कोडिंग असिस्टेंट, शिक्षा प्लेटफ़ॉर्म और बिज़नेस ऑटोमेशन सहित।',
    faqQ2: 'InBharat AI कौन-कौन सी भारतीय भाषाएँ समर्थित करता है?',
    faqA2: 'फ़िलहाल ग्यारह भाषाएँ: अंग्रेज़ी, हिन्दी, बंगाली, तेलुगु, मराठी, तमिल, गुजराती, कन्नड़, मलयालम, ओड़िया और असमिया।',
    faqQ3: 'क्या InBharat AI मुफ़्त में आज़माया जा सकता है?',
    faqA3: 'हाँ। साइन-इन करने से पहले आपको InBharat AI कंसोल पर कुछ मुफ़्त संदेश मिलते हैं। क्रेडिट कार्ड की ज़रूरत नहीं।',
    faqQ4: 'क्या मुझे कुछ इंस्टॉल करना होगा?',
    faqA4: 'नहीं। InBharat AI किसी भी आधुनिक डिवाइस — फ़ोन, टैबलेट या लैपटॉप — के ब्राउज़र में चलता है।',
    faqQ5: 'क्या InBharat AI मोबाइल पर काम करता है?',
    faqA5: 'हाँ। साइट और InBharat AI कंसोल दोनों मोबाइल-फर्स्ट हैं और फ़ोन, टैबलेट और डेस्कटॉप पर काम करते हैं।',
    faqQ6: 'टीम से कैसे संपर्क करें?',
    faqA6: 'हमें ईमेल करें, या LinkedIn, X, Instagram या GitHub पर मिलें। सभी विकल्प संपर्क पृष्ठ पर सूचीबद्ध हैं।',
    navAbout: 'हमारे बारे में',
    navContact: 'संपर्क',
    navPrivacy: 'गोपनीयता',
    navTerms: 'शर्तें',
  },
  bn: {
    landFaqLabel: 'উত্তর সহ প্রশ্ন',
    landFaqTitle: 'প্রায়শই জিজ্ঞাসিত প্রশ্ন',
    landFaqDesc: 'সহজ ভাষায় মূল কথা। আরও জানতে চাইলে যোগাযোগ পৃষ্ঠা এক ক্লিক দূরে।',
    faqQ1: 'InBharat AI কী?',
    faqA1: 'InBharat AI একটি স্বাধীন AI প্রোডাক্ট স্টুডিও যা ভারতের জন্য সাশ্রয়ী, ভয়েস-ফার্স্ট, বহুভাষিক AI টুল তৈরি করে — এজেন্টিক সার্চ, কোডিং অ্যাসিস্ট্যান্ট, শিক্ষা প্ল্যাটফর্ম এবং ব্যবসায়িক অটোমেশন সহ।',
    faqQ2: 'InBharat AI কোন কোন ভারতীয় ভাষা সমর্থন করে?',
    faqA2: 'এই মুহূর্তে এগারোটি ভাষা: ইংরেজি, হিন্দি, বাংলা, তেলুগু, মারাঠি, তামিল, গুজরাটি, কন্নড়, মালয়ালম, ওড়িয়া এবং অসমীয়া।',
    faqQ3: 'InBharat AI কি বিনামূল্যে চেষ্টা করা যায়?',
    faqA3: 'হ্যাঁ। সাইন-ইন করার আগে InBharat AI কনসোলে আপনি কিছু বিনামূল্যের বার্তা পান। কোনো ক্রেডিট কার্ড লাগে না।',
    faqQ4: 'কিছু ইনস্টল করা কি প্রয়োজন?',
    faqA4: 'না। InBharat AI যেকোনো আধুনিক ডিভাইসের — ফোন, ট্যাবলেট বা ল্যাপটপের — ব্রাউজারে চলে।',
    faqQ5: 'InBharat AI কি মোবাইলে কাজ করে?',
    faqA5: 'হ্যাঁ। সাইট এবং InBharat AI কনসোল মোবাইল-ফার্স্ট ডিজাইনে তৈরি এবং ফোন, ট্যাবলেট ও ডেস্কটপে কাজ করে।',
    faqQ6: 'টিমের সঙ্গে কীভাবে যোগাযোগ করব?',
    faqA6: 'আমাদের ইমেল করুন, অথবা LinkedIn, X, Instagram বা GitHub-এ পৌঁছান। সব চ্যানেল যোগাযোগ পৃষ্ঠায় তালিকাভুক্ত।',
    navAbout: 'আমাদের সম্পর্কে',
    navContact: 'যোগাযোগ',
    navPrivacy: 'গোপনীয়তা',
    navTerms: 'শর্তাবলী',
  },
  te: {
    landFaqLabel: 'జవాబులతో ప్రశ్నలు',
    landFaqTitle: 'తరచుగా అడిగే ప్రశ్నలు',
    landFaqDesc: 'సాధారణ భాషలో మూల అంశాలు. ఇంకా అవసరమైతే సంప్రదింపు పేజీ ఒక క్లిక్ దూరంలో ఉంది.',
    faqQ1: 'InBharat AI అంటే ఏమిటి?',
    faqA1: 'InBharat AI అనేది భారతదేశం కోసం సరసమైన, వాయిస్-ఫస్ట్, బహుభాషా AI సాధనాలను నిర్మించే స్వతంత్ర AI ఉత్పత్తి స్టూడియో — ఏజెంటిక్ సెర్చ్, కోడింగ్ అసిస్టెంట్‌లు, విద్యా ప్లాట్‌ఫారమ్‌లు మరియు వ్యాపార ఆటోమేషన్ సహా.',
    faqQ2: 'InBharat AI ఏ భారతీయ భాషలను సపోర్ట్ చేస్తుంది?',
    faqA2: 'ప్రస్తుతం పదకొండు భాషలు: ఇంగ్లీషు, హిందీ, బెంగాలీ, తెలుగు, మరాఠీ, తమిళం, గుజరాతీ, కన్నడ, మలయాళం, ఒడియా మరియు అస్సామీ.',
    faqQ3: 'InBharat AI ఉచితంగా ప్రయత్నించవచ్చా?',
    faqA3: 'అవును. సైన్-ఇన్ చేసే ముందు InBharat AI కన్సోల్‌లో మీకు కొన్ని ఉచిత సందేశాలు లభిస్తాయి. క్రెడిట్ కార్డ్ అవసరం లేదు.',
    faqQ4: 'ఏదైనా ఇన్‌స్టాల్ చేయాలా?',
    faqA4: 'వద్దు. InBharat AI ఏ ఆధునిక పరికరంలోనైనా — ఫోన్, టాబ్లెట్ లేదా ల్యాప్‌టాప్ — బ్రౌజర్‌లో నడుస్తుంది.',
    faqQ5: 'InBharat AI మొబైల్‌లో పనిచేస్తుందా?',
    faqA5: 'అవును. సైట్ మరియు InBharat AI కన్సోల్ మొబైల్-ఫస్ట్‌గా రూపొందించబడ్డాయి, ఫోన్, టాబ్లెట్ మరియు డెస్క్‌టాప్‌లపై పనిచేస్తాయి.',
    faqQ6: 'టీమ్‌ను ఎలా సంప్రదించాలి?',
    faqA6: 'మాకు ఇమెయిల్ చేయండి లేదా LinkedIn, X, Instagram లేదా GitHub‌లో సంప్రదించండి. అన్ని ఛానెల్‌లు సంప్రదింపు పేజీలో జాబితా చేయబడ్డాయి.',
    navAbout: 'మా గురించి',
    navContact: 'సంప్రదించండి',
    navPrivacy: 'గోప్యత',
    navTerms: 'నిబంధనలు',
  },
  mr: {
    landFaqLabel: 'उत्तरांसह प्रश्न',
    landFaqTitle: 'वारंवार विचारले जाणारे प्रश्न',
    landFaqDesc: 'सोप्या भाषेत मूळ माहिती. अधिक हवे असल्यास संपर्क पृष्ठ एका क्लिकवर आहे.',
    faqQ1: 'InBharat AI म्हणजे काय?',
    faqA1: 'InBharat AI हा एक स्वतंत्र AI उत्पादन स्टुडिओ आहे जो भारतासाठी परवडणारी, व्हॉइस-फर्स्ट, बहुभाषिक AI साधने तयार करतो — एजेंटिक सर्च, कोडिंग असिस्टंट, शिक्षण प्लॅटफॉर्म आणि व्यवसाय ऑटोमेशन यांसह.',
    faqQ2: 'InBharat AI कोणत्या भारतीय भाषांना समर्थन देतो?',
    faqA2: 'सध्या अकरा भाषा: इंग्रजी, हिंदी, बंगाली, तेलुगू, मराठी, तमिळ, गुजराती, कन्नड, मल्याळम, ओडिया आणि आसामी.',
    faqQ3: 'InBharat AI विनामूल्य वापरून पाहता येतो का?',
    faqA3: 'होय. साइन-इन करण्यापूर्वी InBharat AI कन्सोलवर तुम्हाला काही विनामूल्य संदेश मिळतात. क्रेडिट कार्डची आवश्यकता नाही.',
    faqQ4: 'काही इन्स्टॉल करावे लागते का?',
    faqA4: 'नाही. InBharat AI कोणत्याही आधुनिक उपकरणाच्या — फोन, टॅबलेट किंवा लॅपटॉपच्या — ब्राउझरमध्ये चालतो.',
    faqQ5: 'InBharat AI मोबाईलवर काम करतो का?',
    faqA5: 'होय. साइट आणि InBharat AI कन्सोल मोबाईल-फर्स्ट डिझाइन केलेले आहेत आणि फोन, टॅबलेट व डेस्कटॉपवर काम करतात.',
    faqQ6: 'टीमशी संपर्क कसा साधावा?',
    faqA6: 'आम्हाला ईमेल करा, किंवा LinkedIn, X, Instagram किंवा GitHub वर भेटा. सर्व चॅनेल्स संपर्क पृष्ठावर सूचीबद्ध आहेत.',
    navAbout: 'आमच्याबद्दल',
    navContact: 'संपर्क',
    navPrivacy: 'गोपनीयता',
    navTerms: 'अटी',
  },
  ta: {
    landFaqLabel: 'பதில்களுடன் கேள்விகள்',
    landFaqTitle: 'அடிக்கடி கேட்கப்படும் கேள்விகள்',
    landFaqDesc: 'எளிய மொழியில் அடிப்படை தகவல்கள். மேலும் தேவைப்பட்டால் தொடர்பு பக்கம் ஒரு கிளிக் தொலைவில் உள்ளது.',
    faqQ1: 'InBharat AI என்றால் என்ன?',
    faqA1: 'InBharat AI என்பது இந்தியாவுக்காக மலிவான, குரல்-முதல், பல மொழி AI கருவிகளை உருவாக்கும் ஒரு சுயாதீன AI தயாரிப்பு ஸ்டுடியோ ஆகும் — ஏஜெண்டிக் தேடல், குறியீட்டு உதவியாளர்கள், கல்வி தளங்கள் மற்றும் வணிக தானியக்கம் உட்பட.',
    faqQ2: 'InBharat AI எந்த இந்திய மொழிகளை ஆதரிக்கிறது?',
    faqA2: 'தற்போது பதினொரு மொழிகள்: ஆங்கிலம், இந்தி, பெங்காலி, தெலுங்கு, மராத்தி, தமிழ், குஜராத்தி, கன்னடம், மலையாளம், ஒடியா மற்றும் அசாமி.',
    faqQ3: 'InBharat AI இலவசமாக முயற்சிக்கலாமா?',
    faqA3: 'ஆம். உள்நுழைவதற்கு முன் InBharat AI கன்சோலில் உங்களுக்கு சில இலவச செய்திகள் கிடைக்கும். கிரெடிட் கார்டு தேவையில்லை.',
    faqQ4: 'எதையாவது நிறுவ வேண்டுமா?',
    faqA4: 'இல்லை. InBharat AI எந்த நவீன சாதனத்திலும் — தொலைபேசி, டேப்லெட் அல்லது மடிக்கணினியில் — உலாவியில் இயங்கும்.',
    faqQ5: 'InBharat AI மொபைலில் வேலை செய்யுமா?',
    faqA5: 'ஆம். தளமும் InBharat AI கன்சோலும் மொபைல்-முதல் வடிவமைப்பில் உருவாக்கப்பட்டுள்ளன, தொலைபேசிகள், டேப்லெட்கள் மற்றும் டெஸ்க்டாப்களில் வேலை செய்கின்றன.',
    faqQ6: 'குழுவை எவ்வாறு தொடர்பு கொள்வது?',
    faqA6: 'எங்களுக்கு மின்னஞ்சல் அனுப்புங்கள், அல்லது LinkedIn, X, Instagram அல்லது GitHub இல் தொடர்பு கொள்ளுங்கள். அனைத்து சேனல்களும் தொடர்பு பக்கத்தில் பட்டியலிடப்பட்டுள்ளன.',
    navAbout: 'எங்களைப் பற்றி',
    navContact: 'தொடர்பு',
    navPrivacy: 'தனியுரிமை',
    navTerms: 'நிபந்தனைகள்',
  },
  gu: {
    landFaqLabel: 'જવાબો સાથેના પ્રશ્નો',
    landFaqTitle: 'વારંવાર પૂછાતા પ્રશ્નો',
    landFaqDesc: 'સરળ ભાષામાં મૂળ માહિતી. વધુ જોઈએ તો સંપર્ક પૃષ્ઠ એક ક્લિક દૂર છે.',
    faqQ1: 'InBharat AI શું છે?',
    faqA1: 'InBharat AI એક સ્વતંત્ર AI પ્રોડક્ટ સ્ટુડિયો છે જે ભારત માટે પરવડે તેવા, વોઈસ-ફર્સ્ટ, બહુભાષી AI સાધનો બનાવે છે — એજેન્ટિક સર્ચ, કોડિંગ આસિસ્ટન્ટ્સ, શિક્ષણ પ્લેટફોર્મ્સ અને બિઝનેસ ઓટોમેશન સહિત.',
    faqQ2: 'InBharat AI કઈ ભારતીય ભાષાઓને સપોર્ટ કરે છે?',
    faqA2: 'હાલમાં અગિયાર ભાષાઓ: અંગ્રેજી, હિન્દી, બંગાળી, તેલુગુ, મરાઠી, તમિલ, ગુજરાતી, કન્નડ, મલયાલમ, ઓડિયા અને આસામી.',
    faqQ3: 'શું InBharat AI મફતમાં અજમાવી શકાય?',
    faqA3: 'હા. સાઈન-ઇન કરતા પહેલા InBharat AI કન્સોલ પર તમને થોડા મફત સંદેશા મળે છે. ક્રેડિટ કાર્ડની જરૂર નથી.',
    faqQ4: 'કંઈ ઇન્સ્ટોલ કરવાનું છે?',
    faqA4: 'ના. InBharat AI કોઈપણ આધુનિક ડિવાઈસના — ફોન, ટેબ્લેટ કે લેપટોપના — બ્રાઉઝરમાં ચાલે છે.',
    faqQ5: 'શું InBharat AI મોબાઈલ પર કામ કરે છે?',
    faqA5: 'હા. સાઈટ અને InBharat AI કન્સોલ મોબાઈલ-ફર્સ્ટ ડિઝાઈન છે અને ફોન, ટેબ્લેટ અને ડેસ્કટોપ પર કામ કરે છે.',
    faqQ6: 'ટીમનો સંપર્ક કેવી રીતે કરવો?',
    faqA6: 'અમને ઈમેઈલ કરો, અથવા LinkedIn, X, Instagram અથવા GitHub પર સંપર્ક કરો. બધી ચેનલો સંપર્ક પૃષ્ઠ પર સૂચિબદ્ધ છે.',
    navAbout: 'અમારા વિશે',
    navContact: 'સંપર્ક',
    navPrivacy: 'ગોપનીયતા',
    navTerms: 'શરતો',
  },
  kn: {
    landFaqLabel: 'ಉತ್ತರಗಳೊಂದಿಗೆ ಪ್ರಶ್ನೆಗಳು',
    landFaqTitle: 'ಪದೇ ಪದೇ ಕೇಳಲಾಗುವ ಪ್ರಶ್ನೆಗಳು',
    landFaqDesc: 'ಸರಳ ಭಾಷೆಯಲ್ಲಿ ಮೂಲಭೂತ ಮಾಹಿತಿ. ಹೆಚ್ಚು ಬೇಕಿದ್ದರೆ ಸಂಪರ್ಕ ಪುಟ ಒಂದು ಕ್ಲಿಕ್ ದೂರದಲ್ಲಿದೆ.',
    faqQ1: 'InBharat AI ಎಂದರೇನು?',
    faqA1: 'InBharat AI ಎಂಬುದು ಭಾರತಕ್ಕಾಗಿ ಕೈಗೆಟುಕುವ, ಧ್ವನಿ-ಮೊದಲ, ಬಹುಭಾಷಿಕ AI ಸಾಧನಗಳನ್ನು ನಿರ್ಮಿಸುವ ಸ್ವತಂತ್ರ AI ಉತ್ಪನ್ನ ಸ್ಟುಡಿಯೋ — ಏಜೆಂಟಿಕ್ ಸರ್ಚ್, ಕೋಡಿಂಗ್ ಅಸಿಸ್ಟೆಂಟ್‌ಗಳು, ಶಿಕ್ಷಣ ವೇದಿಕೆಗಳು ಮತ್ತು ವ್ಯಾಪಾರ ಆಟೋಮೇಷನ್ ಸೇರಿದಂತೆ.',
    faqQ2: 'InBharat AI ಯಾವ ಭಾರತೀಯ ಭಾಷೆಗಳನ್ನು ಬೆಂಬಲಿಸುತ್ತದೆ?',
    faqA2: 'ಪ್ರಸ್ತುತ ಹನ್ನೊಂದು ಭಾಷೆಗಳು: ಇಂಗ್ಲಿಷ್, ಹಿಂದಿ, ಬಂಗಾಳಿ, ತೆಲುಗು, ಮರಾಠಿ, ತಮಿಳು, ಗುಜರಾತಿ, ಕನ್ನಡ, ಮಲಯಾಳಂ, ಒಡಿಯಾ ಮತ್ತು ಅಸ್ಸಾಮಿ.',
    faqQ3: 'InBharat AI ಅನ್ನು ಉಚಿತವಾಗಿ ಪ್ರಯತ್ನಿಸಬಹುದೇ?',
    faqA3: 'ಹೌದು. ಸೈನ್-ಇನ್ ಮಾಡುವ ಮೊದಲು InBharat AI ಕನ್ಸೋಲ್‌ನಲ್ಲಿ ನಿಮಗೆ ಕೆಲವು ಉಚಿತ ಸಂದೇಶಗಳು ಸಿಗುತ್ತವೆ. ಕ್ರೆಡಿಟ್ ಕಾರ್ಡ್ ಅಗತ್ಯವಿಲ್ಲ.',
    faqQ4: 'ಏನಾದರೂ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಬೇಕೇ?',
    faqA4: 'ಇಲ್ಲ. InBharat AI ಯಾವುದೇ ಆಧುನಿಕ ಸಾಧನದ — ಫೋನ್, ಟ್ಯಾಬ್ಲೆಟ್ ಅಥವಾ ಲ್ಯಾಪ್‌ಟಾಪ್ — ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ.',
    faqQ5: 'InBharat AI ಮೊಬೈಲ್‌ನಲ್ಲಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆಯೇ?',
    faqA5: 'ಹೌದು. ಸೈಟ್ ಮತ್ತು InBharat AI ಕನ್ಸೋಲ್ ಮೊಬೈಲ್-ಮೊದಲ ವಿನ್ಯಾಸ ಮತ್ತು ಫೋನ್‌ಗಳು, ಟ್ಯಾಬ್ಲೆಟ್‌ಗಳು ಮತ್ತು ಡೆಸ್ಕ್‌ಟಾಪ್‌ಗಳಲ್ಲಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ.',
    faqQ6: 'ತಂಡವನ್ನು ಹೇಗೆ ಸಂಪರ್ಕಿಸುವುದು?',
    faqA6: 'ನಮಗೆ ಇಮೇಲ್ ಮಾಡಿ, ಅಥವಾ LinkedIn, X, Instagram ಅಥವಾ GitHub‌ನಲ್ಲಿ ತಲುಪಿ. ಎಲ್ಲಾ ಚಾನೆಲ್‌ಗಳನ್ನು ಸಂಪರ್ಕ ಪುಟದಲ್ಲಿ ಪಟ್ಟಿ ಮಾಡಲಾಗಿದೆ.',
    navAbout: 'ನಮ್ಮ ಬಗ್ಗೆ',
    navContact: 'ಸಂಪರ್ಕಿಸಿ',
    navPrivacy: 'ಗೌಪ್ಯತೆ',
    navTerms: 'ನಿಯಮಗಳು',
  },
  ml: {
    landFaqLabel: 'ഉത്തരങ്ങളോടെയുള്ള ചോദ്യങ്ങൾ',
    landFaqTitle: 'പതിവായി ചോദിക്കുന്ന ചോദ്യങ്ങൾ',
    landFaqDesc: 'ലളിതമായ ഭാഷയിൽ അടിസ്ഥാന വിവരങ്ങൾ. കൂടുതൽ വേണമെങ്കിൽ ബന്ധപ്പെടാനുള്ള പേജ് ഒരു ക്ലിക്ക് അകലെയാണ്.',
    faqQ1: 'InBharat AI എന്താണ്?',
    faqA1: 'ഇന്ത്യയ്ക്കായി മിതമായ വിലയിലുള്ള, ശബ്ദ-ആദ്യ, ബഹുഭാഷാ AI ഉപകരണങ്ങൾ നിർമ്മിക്കുന്ന ഒരു സ്വതന്ത്ര AI ഉൽപ്പന്ന സ്റ്റുഡിയോയാണ് InBharat AI — ഏജൻ്റിക് സെർച്ച്, കോഡിംഗ് അസിസ്റ്റൻ്റുകൾ, വിദ്യാഭ്യാസ പ്ലാറ്റ്ഫോമുകൾ, ബിസിനസ് ഓട്ടോമേഷൻ എന്നിവയുൾപ്പെടെ.',
    faqQ2: 'InBharat AI ഏതൊക്കെ ഇന്ത്യൻ ഭാഷകളെ പിന്തുണയ്ക്കുന്നു?',
    faqA2: 'ഇപ്പോൾ പതിനൊന്ന് ഭാഷകൾ: ഇംഗ്ലീഷ്, ഹിന്ദി, ബംഗാളി, തെലുങ്ക്, മറാത്തി, തമിഴ്, ഗുജറാത്തി, കന്നഡ, മലയാളം, ഒറിയ, അസമീസ്.',
    faqQ3: 'InBharat AI സൗജന്യമായി പരീക്ഷിക്കാമോ?',
    faqA3: 'അതെ. സൈൻ-ഇൻ ചെയ്യുന്നതിന് മുമ്പ് InBharat AI കൺസോളിൽ നിങ്ങൾക്ക് കുറച്ച് സൗജന്യ സന്ദേശങ്ങൾ ലഭിക്കും. ക്രെഡിറ്റ് കാർഡ് വേണ്ട.',
    faqQ4: 'എന്തെങ്കിലും ഇൻസ്റ്റാൾ ചെയ്യണോ?',
    faqA4: 'ഇല്ല. InBharat AI ഏതെങ്കിലും ആധുനിക ഉപകരണത്തിൻ്റെ — ഫോൺ, ടാബ്‌ലെറ്റ് അല്ലെങ്കിൽ ലാപ്ടോപ്പ് — ബ്രൗസറിൽ പ്രവർത്തിക്കും.',
    faqQ5: 'InBharat AI മൊബൈലിൽ പ്രവർത്തിക്കുമോ?',
    faqA5: 'അതെ. സൈറ്റും InBharat AI കൺസോളും മൊബൈൽ-ഫസ്റ്റ് ഡിസൈൻ ചെയ്തവയും ഫോണുകളിലും ടാബ്‌ലെറ്റുകളിലും ഡെസ്ക്ടോപ്പുകളിലും പ്രവർത്തിക്കുന്നു.',
    faqQ6: 'ടീമിനെ എങ്ങനെ ബന്ധപ്പെടാം?',
    faqA6: 'ഞങ്ങൾക്ക് ഇമെയിൽ ചെയ്യുക, അല്ലെങ്കിൽ LinkedIn, X, Instagram അല്ലെങ്കിൽ GitHub‌ലിൽ ബന്ധപ്പെടുക. എല്ലാ ചാനലുകളും ബന്ധപ്പെടാനുള്ള പേജിൽ പട്ടികപ്പെടുത്തിയിട്ടുണ്ട്.',
    navAbout: 'ഞങ്ങളെപ്പറ്റി',
    navContact: 'ബന്ധപ്പെടുക',
    navPrivacy: 'സ്വകാര്യത',
    navTerms: 'നിബന്ധനകൾ',
  },
  or: {
    landFaqLabel: 'ଉତ୍ତର ସହିତ ପ୍ରଶ୍ନ',
    landFaqTitle: 'ବାରମ୍ବାର ପଚରାଯାଉଥିବା ପ୍ରଶ୍ନ',
    landFaqDesc: 'ସରଳ ଭାଷାରେ ମୌଳିକ ତଥ୍ୟ। ଅଧିକ ଆବଶ୍ୟକ ହେଲେ ଯୋଗାଯୋଗ ପୃଷ୍ଠା ଗୋଟିଏ କ୍ଲିକ୍ ଦୂରରେ ଅଛି।',
    faqQ1: 'InBharat AI କଣ?',
    faqA1: 'InBharat AI ହେଉଛି ଗୋଟିଏ ସ୍ୱାଧୀନ AI ଉତ୍ପାଦ ଷ୍ଟୁଡିଓ ଯାହା ଭାରତ ପାଇଁ ସୁଲଭ, ଭଏସ୍-ଫାର୍ଷ୍ଟ, ବହୁଭାଷୀ AI ଉପକରଣ ତିଆରି କରେ — ଏଜେଣ୍ଟିକ୍ ସର୍ଚ୍, କୋଡିଂ ସହାୟକ, ଶିକ୍ଷା ପ୍ଲାଟଫର୍ମ ଏବଂ ବ୍ୟବସାୟ ସ୍ୱଚାଳନ ସମେତ।',
    faqQ2: 'InBharat AI କେଉଁ ଭାରତୀୟ ଭାଷା ସମର୍ଥନ କରେ?',
    faqA2: 'ବର୍ତ୍ତମାନ ଏଗାର ଭାଷା: ଇଂରାଜୀ, ହିନ୍ଦୀ, ବଙ୍ଗଳା, ତେଲୁଗୁ, ମରାଠୀ, ତମିଲ, ଗୁଜରାଟୀ, କନ୍ନଡ଼, ମଲୟାଳମ୍, ଓଡ଼ିଆ ଏବଂ ଅସମୀୟା।',
    faqQ3: 'InBharat AI ମାଗଣାରେ ଚେଷ୍ଟା କରାଯାଇପାରିବ କି?',
    faqA3: 'ହଁ। ସାଇନ୍-ଇନ୍ କରିବା ପୂର୍ବରୁ InBharat AI କନସୋଲରେ ଆପଣ କିଛି ମାଗଣା ବାର୍ତ୍ତା ପାଉଛନ୍ତି। କ୍ରେଡିଟ କାର୍ଡ ଆବଶ୍ୟକ ନୁହେଁ।',
    faqQ4: 'କିଛି ଇନଷ୍ଟଲ୍ କରିବାକୁ ପଡ଼ିବ କି?',
    faqA4: 'ନା। InBharat AI ଯେକୌଣସି ଆଧୁନିକ ଡିଭାଇସର — ଫୋନ, ଟାବଲେଟ କିମ୍ବା ଲ୍ୟାପଟପର — ବ୍ରାଉଜରରେ ଚାଲିଥାଏ।',
    faqQ5: 'InBharat AI ମୋବାଇଲରେ କାମ କରେ କି?',
    faqA5: 'ହଁ। ସାଇଟ୍ ଏବଂ InBharat AI କନସୋଲ୍ ମୋବାଇଲ୍-ଫାର୍ଷ୍ଟ ଡିଜାଇନ୍ ଏବଂ ଫୋନ, ଟାବଲେଟ ଓ ଡେସ୍କଟପରେ କାମ କରେ।',
    faqQ6: 'ଟିମ୍ ସହିତ କିପରି ଯୋଗାଯୋଗ କରିବେ?',
    faqA6: 'ଆମକୁ ଇମେଲ କରନ୍ତୁ, କିମ୍ବା LinkedIn, X, Instagram କିମ୍ବା GitHub‌ରେ ଯୋଗାଯୋଗ କରନ୍ତୁ। ସମସ୍ତ ଚ୍ୟାନେଲ ଯୋଗାଯୋଗ ପୃଷ୍ଠାରେ ତାଲିକାଭୁକ୍ତ।',
    navAbout: 'ଆମ ବିଷୟରେ',
    navContact: 'ଯୋଗାଯୋଗ',
    navPrivacy: 'ଗୋପନୀୟତା',
    navTerms: 'ସର୍ତ୍ତାବଳୀ',
  },
  as: {
    landFaqLabel: 'উত্তৰসহ প্ৰশ্ন',
    landFaqTitle: 'সঘনাই সোধা প্ৰশ্ন',
    landFaqDesc: 'সৰল ভাষাত মূল তথ্য। অধিক প্ৰয়োজন হ\'লে যোগাযোগ পৃষ্ঠা এটা ক্লিকৰ দূৰত আছে।',
    faqQ1: 'InBharat AI কি?',
    faqA1: 'InBharat AI হৈছে ভাৰতৰ বাবে সুলভ, কণ্ঠ-প্ৰথম, বহুভাষিক AI সঁজুলি নিৰ্মাণ কৰা এটা স্বাধীন AI সামগ্ৰী ষ্টুডিঅ\' — এজেন্টিক সন্ধান, ক\'ডিং সহায়ক, শিক্ষা প্লেটফৰ্ম আৰু ব্যৱসায় স্বয়ংক্ৰিয়কৰণকে ধৰি।',
    faqQ2: 'InBharat AI কোনবোৰ ভাৰতীয় ভাষা সমৰ্থন কৰে?',
    faqA2: 'বৰ্তমান এঘাৰটা ভাষা: ইংৰাজী, হিন্দী, বাংলা, তেলেগু, মাৰাঠী, তামিল, গুজৰাটী, কন্নড়, মালয়ালম, ওড়িয়া আৰু অসমীয়া।',
    faqQ3: 'InBharat AI বিনামূলীয়াকৈ চেষ্টা কৰিব পাৰিনে?',
    faqA3: 'হয়। চাইন-ইন কৰাৰ আগতে InBharat AI ক\'ন্সলত আপুনি কেইটামান বিনামূলীয়া বাৰ্তা পাব। ক্ৰেডিট কাৰ্ডৰ প্ৰয়োজন নাই।',
    faqQ4: 'কিবা ইনষ্টল কৰিব লাগিবনে?',
    faqA4: 'নাই। InBharat AI যিকোনো আধুনিক ডিভাইচৰ — ফোন, টেবলেট বা লেপটপৰ — ব্ৰাউজাৰত চলে।',
    faqQ5: 'InBharat AI মোবাইলত কাম কৰেনে?',
    faqA5: 'হয়। ছাইট আৰু InBharat AI ক\'ন্সল মোবাইল-প্ৰথম ডিজাইন আৰু ফোন, টেবলেট আৰু ডেস্কটপত কাম কৰে।',
    faqQ6: 'দলৰ সৈতে কেনেকৈ যোগাযোগ কৰিম?',
    faqA6: 'আমাক ইমেইল কৰক, বা LinkedIn, X, Instagram বা GitHub‌ত যোগাযোগ কৰক। সকলো চেনেল যোগাযোগ পৃষ্ঠাত তালিকাভুক্ত।',
    navAbout: 'আমাৰ বিষয়ে',
    navContact: 'যোগাযোগ',
    navPrivacy: 'গোপনীয়তা',
    navTerms: 'চৰ্তাবলী',
  },
};

async function main() {
  const files = await fs.readdir(LOCALES_DIR);
  let updated = 0;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const code = f.replace(/\.json$/, '');
    const filePath = path.join(LOCALES_DIR, f);
    const raw = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(raw);
    const before = JSON.stringify(json);

    // Remove orphan keys.
    for (const k of ORPHAN_KEYS) delete json[k];

    // Add new keys (don't overwrite if a translator has already filled them).
    const additions = NEW_KEYS[code] ?? NEW_KEYS.en;
    for (const [k, v] of Object.entries(additions)) {
      if (!(k in json)) json[k] = v;
    }

    if (JSON.stringify(json) === before) continue;
    await fs.writeFile(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`✓ ${f}`);
    updated++;
  }
  console.log(`Done. ${updated} locale file(s) touched.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
