/**
 * Social Media Image Generation Prompt Master System & Utility
 * 
 * Designed for Instagram Carousels (1:1 / 4:5) and LinkedIn Posts (1.91:1 / 1:1).
 * Optimised for Flux, Midjourney v6, DALL-E 3, Imagen 3, and Stable Diffusion XL.
 */

export type AspectRatio = "1:1" | "4:5" | "1.91:1" | "16:9" | "9:16";
export type Platform = "INSTAGRAM" | "LINKEDIN";

export type VisualStyle =
  | "3d-render"
  | "photorealistic"
  | "minimalist-vector"
  | "editorial"
  | "isometric"
  | "dark-mode-ui"
  | "glassmorphism"
  | "abstract-gradient"
  | "cyberpunk-tech"
  | "tech-infographic"
  | "architecture-diagram";

export interface ImagePromptOptions {
  /** Main subject or topic of the graphic/photo */
  topic: string;
  /** Visual design style */
  style?: VisualStyle;
  /** Target image aspect ratio (Defaults: 4:5 for IG, 1.91:1 for LinkedIn) */
  aspectRatio?: AspectRatio;
  /** Target platform for optimal framing */
  platform?: Platform;
  /** Desired mood or emotion (e.g., "sleek, modern, premium, high-tech") */
  mood?: string;
  /** Color scheme (e.g., "deep royal blue, electric violet, clean bright white accents") */
  colorPalette?: string;
  /** Lighting style (e.g., "soft diffused studio lighting, subtle volumetric glow") */
  lighting?: string;
  /** Camera / perspective details (e.g., "eye-level macro shot, 85mm lens, shallow depth of field") */
  cameraDetails?: string;
  /** Slide context if part of a carousel post */
  carouselInfo?: {
    slideNumber: number;
    totalSlides: number;
    slideRole: "cover" | "content" | "summary" | "call-to-action";
  };
  /** Custom text overlay area directive to ensure space for captions/typography */
  leaveNegativeSpace?: boolean;
  /** Tech architecture infographic details (for flowcharts, timelines, & metrics graphics) */
  infographicDetails?: {
    headerTitle?: string;
    subtitle?: string;
    flowchartNodes?: string[];
    metricsText?: string;
    takeawayQuote?: string;
    timelineSteps?: string[];
  };
}

export interface TechInfographicOptions {
  title: string;
  subtitle?: string;
  flowchartNodes?: string[];
  timelineSteps?: string[];
  metricsText?: string;
  takeawayQuote?: string;
  platform?: Platform;
  aspectRatio?: AspectRatio;
  colorTheme?: string;
}

export interface GeneratedPromptResult {
  /** The final optimized positive prompt string */
  prompt: string;
  /** Recommended negative prompt (for Stable Diffusion / Midjourney --no) */
  negativePrompt: string;
  /** Suggested aspect ratio parameter */
  aspectRatio: AspectRatio;
  /** Formatted parameters for specific popular image generators */
  generatorFormats: {
    dallE3: string;
    midjourney: string;
    flux: string;
    stableDiffusion: {
      prompt: string;
      negativePrompt: string;
    };
  };
}

/**
 * Master System Prompt for LLM prompt refinement engine
 */
export const SYSTEM_IMAGE_PROMPT = `
You are an expert AI Visual Prompt Engineer specializing in high-converting Instagram carousels and LinkedIn social media graphics.

Your objective is to turn simple concepts into hyper-detailed, photorealistic, or visually stunning image generation prompts that capture user attention instantly on social media feeds.

Follow these 6 Golden Rules of Social Media Image Prompting:

1. SUBJECT & ACTION: Define a crisp central focal point with strong visual hierarchy.
2. COMPOSITION & LAYOUT: Specify camera angle, field of view, rule of thirds, and clean negative space (if text overlays will be added).
3. LIGHTING & ENVIRONMENT: Use cinematic lighting terms (cinematic rim light, volumetric lighting, soft studio key light, octave render).
4. COLOR & PALETTE: Request modern, harmonious color palettes (gradient mesh, deep contrast, vibrant accent highlights).
5. STYLE & TECHNIQUE: Explicitly state the render engine or photography setup (Octane Render 3D, 85mm portrait, glassmorphism UI, vector geometry).
6. PLATFORM SPECS:
   - Instagram (4:5 / 1:1): Vertical vertical emphasis, bold contrast, mobile-first clarity.
   - LinkedIn (1.91:1 / 1:1): Clean professional graphics, polished UI mockups, editorial executive look.

AVOID: Generic terms like "beautiful", "HD", "4K", "trending on ArtStation", messy crowded composition, blurry text elements.
`.trim();

/**
 * Default style templates with pre-tuned visual attributes
 */
export const STYLE_PRESETS: Record<
  VisualStyle,
  {
    description: string;
    lighting: string;
    colorPalette: string;
    camera: string;
    keywords: string[];
  }
> = {
  "3d-render": {
    description: "Sleek 3D clay and glass abstract render, modern SaaS aesthetic",
    lighting: "Soft ambient studio lighting with subtle rim light highlights",
    colorPalette: "Deep indigo, soft pastel accents, electric blue neon highlights",
    camera: "Isometric 45-degree angle shot, sharp detail",
    keywords: ["Octane render", "Cinema 4D style", "smooth clay texture", "glassmorphism element", "subsurface scattering"],
  },
  photorealistic: {
    description: "High-end commercial photography with shallow depth of field",
    lighting: "Natural morning sunlight streaming through window with warm soft shadows",
    colorPalette: "Rich natural tones with crisp contrast",
    camera: "Shot on 85mm prime lens, f/1.8 aperture, sharp focus on subject, smooth bokeh background",
    keywords: ["award-winning photography", "hyperrealistic texture", "cinematic depth of field"],
  },
  "minimalist-vector": {
    description: "Clean modern flat vector art with geometric precision",
    lighting: "Even flat lighting, high contrast, clean vector shading",
    colorPalette: "Minimal 3-color palette: charcoal black, cream white, sharp coral orange accent",
    camera: "Frontal orthographic perspective",
    keywords: ["minimalist vector illustration", "clean geometric shapes", "Swiss design style", "bold typography space"],
  },
  editorial: {
    description: "High-fashion executive editorial magazine aesthetic",
    lighting: "Dramatic high-contrast key lighting, subtle fill",
    colorPalette: "Monochromatic grey tones with rich gold accent",
    camera: "Medium close-up portrait, Hasselblad medium format camera look",
    keywords: ["Vogue editorial photo", "architectural interior", "sophisticated minimalist luxury"],
  },
  isometric: {
    description: "Detailed 3D isometric workspace illustration",
    lighting: "Clean ambient shadowless lighting with soft drop shadows",
    colorPalette: "Vibrant tech palette: cyan, violet, sleek dark grey base",
    camera: "True isometric 30-degree orthographic view",
    keywords: ["isometric view", "3D icon scene", "miniature diorama", "clean modern workflow visual"],
  },
  "dark-mode-ui": {
    description: "Futuristic dark mode UI interface with subtle glowing elements",
    lighting: "Self-illuminating neon UI widgets, subtle ambient backlight",
    colorPalette: "Dark slate `#0d1117`, vibrant purple `#8b5cf6`, cyan `#06b6d4` UI highlights",
    camera: "Slight angle perspective mock-up view, shallow depth of field on foreground card",
    keywords: ["modern UI mockup", "dark mode dashboard card", "glass transparency", "glowing telemetry chart"],
  },
  glassmorphism: {
    description: "Frosted translucent glass layered UI elements floating over vibrant blurred gradients",
    lighting: "Soft internal glow with rainbow refraction edges",
    colorPalette: "Vivid rainbow mesh gradient background, frosted white glass panels",
    camera: "Front angle layered 3D depth camera shot",
    keywords: ["frosted glass layer", "glassmorphism style", "blurred gradient backdrop", "translucent interface"],
  },
  "abstract-gradient": {
    description: "Fluid 3D abstract fluid mesh wave and vibrant gradient sphere",
    lighting: "Volumetric iridescent light reflection",
    colorPalette: "Magenta, warm sunrise amber, deep blue violet blend",
    camera: "Macro detail abstract perspective",
    keywords: ["fluid mesh wave", "iridescent liquid dynamic", "3D abstract geometry", "smooth color flow"],
  },
  "cyberpunk-tech": {
    description: "High-tech futuristic visual with glowing holographic data streams",
    lighting: "Dramatic dark scene lit by neon cyan and magenta lights",
    colorPalette: "Midnight navy, electric turquoise, hot pink neon",
    camera: "Cinematic wide angle shot, low perspective",
    keywords: ["holographic display", "future technology overlay", "volumetric fog", "high tech visual"],
  },
  "tech-infographic": {
    description: "Sleek dark mode software architecture infographic featuring glowing flowchart nodes, request lifecycle timeline, metrics card, and key takeaway quote banner",
    lighting: "Deep obsidian canvas `#0A0E1A` lit by glowing cyan `#00F0FF`, electric violet `#8B5CF6`, emerald green `#10B981`, and amber `#F59E0B` directional path arrows",
    colorPalette: "Dark slate navy background `#0A0E1A`, neon electric cyan request flow paths, glowing purple cache cards, emerald green hit paths, amber database nodes",
    camera: "Crisp top-down orthographic visual graphic layout with flat layered glassmorphism cards and sharp technical typography space",
    keywords: [
      "system architecture flowchart",
      "dark mode software infographic diagram",
      "backend data request flow journey",
      "glowing neon visual nodes with icons",
      "color coded connecting arrows",
      "numbered lifecycle timeline steps",
      "average response time metrics panel",
      "highlight quote banner with quotation marks",
      "LinkedIn software engineering carousel graphic"
    ],
  },
  "architecture-diagram": {
    description: "High-level cloud infrastructure and backend architecture schematic with microservices, cache layers, load balancers, and database clusters",
    lighting: "Self-illuminating glowing neon circuit paths on dark slate backdrop",
    colorPalette: "Midnight obsidian background `#090D16`, electric blue `#38BDF8`, purple `#A855F7`, cyan `#06B6D4` node highlights",
    camera: "Direct front orthographic schematic layout, clean structured multi-column arrangement",
    keywords: [
      "cloud architecture diagram",
      "microservices system schematic",
      "dark mode developer visual",
      "glowing data pipeline nodes",
      "Load Balancer, Redis Cache, SQL Database icons",
      "clean technical visual hierarchy"
    ],
  },
};

/**
 * Standard default negative prompt to purge low-quality artifacts
 */
export const DEFAULT_NEGATIVE_PROMPT =
  "blurry, distorted text, low quality, pixelated, jpeg artifacts, ugly, oversaturated, deformed hands, duplicate limbs, cluttered background, out of frame, cropped head, watermark, signature, draft, bad anatomy";

/**
 * Generate a perfected AI image prompt for any social media post or carousel slide.
 */
export function buildImagePrompt(options: ImagePromptOptions): GeneratedPromptResult {
  const {
    topic,
    style = "3d-render",
    platform = "INSTAGRAM",
    aspectRatio = platform === "INSTAGRAM" ? "4:5" : "1.91:1",
    mood = "sleek, modern, professional, high visual impact",
    colorPalette,
    lighting,
    cameraDetails,
    carouselInfo,
    leaveNegativeSpace = true,
  } = options;

  const preset = STYLE_PRESETS[style] || STYLE_PRESETS["3d-render"];

  const selectedPalette = colorPalette || preset.colorPalette;
  const selectedLighting = lighting || preset.lighting;
  const selectedCamera = cameraDetails || preset.camera;

  // Construct structured prompt segments
  const parts: string[] = [];

  // 1. Subject & Core Topic
  let subjectDirective = `A visual representation of "${topic}"`;
  if (carouselInfo) {
    if (carouselInfo.slideRole === "cover") {
      subjectDirective = `Eye-catching cover graphic representing "${topic}", slide 1 hook visual`;
    } else if (carouselInfo.slideRole === "summary" || carouselInfo.slideRole === "call-to-action") {
      subjectDirective = `Concluding key takeaway graphic for "${topic}", clean summary focal point`;
    } else {
      subjectDirective = `Detailed slide ${carouselInfo.slideNumber} visual explaining "${topic}"`;
    }
  }
  parts.push(subjectDirective);

  // 2. Style & Technique
  parts.push(`Style: ${preset.description}`);
  parts.push(`Keywords: ${preset.keywords.join(", ")}`);

  // 3. Infographic & Architecture Layout (if applicable)
  if (style === "tech-infographic" || style === "architecture-diagram" || options.infographicDetails) {
    const details = options.infographicDetails || {};
    const nodesStr = details.flowchartNodes
      ? details.flowchartNodes.join(" -> ")
      : "Browser (User Request) -> Load Balancer -> Application Server -> Cache Check (is data in Redis?) -> Redis Cache / Database Cluster -> HTTP Response";
    const quoteStr =
      details.takeawayQuote ||
      "Fast applications don't always use faster databases — they avoid unnecessary database queries.";
    const metricsStr =
      details.metricsText ||
      "Average Response Time: Cache Hit 1 - 5 ms | Database Query 20 - 150 ms";

    parts.push("Layout Structure: Comprehensive dark-mode tech visual layout with high visual contrast");
    parts.push(
      `Header Section: Bold header titled "${
        details.headerTitle || topic
      }" with subtitle "${details.subtitle || "A step-by-step journey inside a modern backend application"}"`
    );
    parts.push(
      `Central Flowchart Diagram: Connected workflow nodes (${nodesStr}) with glowing neon directional path lines. Color legend: Blue for Request Flow, Green for Cache Hit (Fast Path), Orange for Cache Miss (DB Path), Purple for Response Flow`
    );
    parts.push(
      "Side Panel: 'Backend Components' legend listing Load Balancer, Application Server, Redis Cache, Database Cluster, HTTP Response with glowing 3D-like icons"
    );
    parts.push(
      "Lower Section Timeline: 'Request Lifecycle Timeline' containing numbered steps (1 through 8) inside glowing circles with vector icons"
    );
    parts.push(`Metrics Stat Box: Card displaying '${metricsStr}' with green and orange metric highlights`);
    parts.push(
      `Takeaway Banner: Dark frosted glass quotation block with blue quotes around '${quoteStr}'`
    );
    parts.push(
      "Footer Status Badges: Sleek glowing pill tags displaying [Fast Response], [Scalable], [Reliable], [Cached], and [Production Ready]"
    );
  } else if (leaveNegativeSpace) {
    // Composition & Space for standard graphics
    parts.push(
      "Composition: Clean uncluttered composition with empty negative space designated for text overlay, rule of thirds placement"
    );
  } else {
    parts.push("Composition: Balanced central focal point, wide framed, dramatic visual hierarchy");
  }

  // 4. Camera & Perspective
  parts.push(`Camera & Perspective: ${selectedCamera}`);

  // 5. Lighting & Atmosphere
  parts.push(`Lighting: ${selectedLighting}`);

  // 6. Color Scheme & Mood
  parts.push(`Color Palette: ${selectedPalette}`);
  parts.push(`Mood: ${mood}`);

  // Combine positive prompt
  const mainPrompt = parts.join(". ") + ".";

  // Generator-specific formatting
  const midjourneyAspect =
    aspectRatio === "4:5"
      ? "--ar 4:5"
      : aspectRatio === "1.91:1"
      ? "--ar 16:9"
      : `--ar ${aspectRatio.replace(":", ":")}`;
  const midjourneyPrompt = `${mainPrompt} ${midjourneyAspect} --style raw --v 6.0 --no ${DEFAULT_NEGATIVE_PROMPT}`;
  const dallE3Prompt = `Create a high quality graphic for ${platform} (${aspectRatio} ratio). ${mainPrompt} Ensure there are no grammatical spelling artifacts, clean typography placement, and crisp visual diagram hierarchy.`;
  const fluxPrompt = `${mainPrompt}, ${aspectRatio} aspect ratio, masterpiece, highly detailed developer infographic diagram.`;

  return {
    prompt: mainPrompt,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    aspectRatio,
    generatorFormats: {
      dallE3: dallE3Prompt,
      midjourney: midjourneyPrompt,
      flux: fluxPrompt,
      stableDiffusion: {
        prompt: mainPrompt,
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      },
    },
  };
}

/**
 * Build a specialized AI prompt for developer system architecture flowcharts & tech infographics
 * matching LinkedIn & Instagram backend journey diagrams.
 */
export function buildTechInfographicPrompt(
  options: TechInfographicOptions
): GeneratedPromptResult {
  const {
    title,
    subtitle = "A step-by-step journey inside a modern backend application",
    flowchartNodes = [
      "Browser (User Request)",
      "Load Balancer",
      "Application Server",
      "Cache Check (is data in Redis?)",
      "Redis Cache (Return data instantly)",
      "Database Cluster (SQL/NoSQL)",
      "Store in Redis Cache",
      "HTTP Response",
    ],
    timelineSteps = [
      "1. Browser sends request",
      "2. Load Balancer selects server",
      "3. Application Server processes request",
      "4. Check Redis Cache",
      "5. Cache Hit -> Return OR Cache Miss -> Query Database",
      "6. Save data in Cache",
      "7. Send HTTP Response",
      "8. Browser renders webpage",
    ],
    metricsText = "Average Response Time: Cache Hit 1 - 5 ms | Database Query 20 - 150 ms",
    takeawayQuote = "Fast applications don't always use faster databases — they avoid unnecessary database queries.",
    platform = "LINKEDIN",
    aspectRatio = platform === "LINKEDIN" ? "1.91:1" : "4:5",
    colorTheme = "Dark obsidian navy `#0A0E1A`, electric cyan `#00F0FF`, violet `#8B5CF6`, emerald green `#10B981`, amber orange `#F59E0B`",
  } = options;

  return buildImagePrompt({
    topic: `Tech Architecture Diagram: "${title}"`,
    style: "tech-infographic",
    platform,
    aspectRatio,
    colorPalette: colorTheme,
    mood: "authoritative, technical, high contrast, modern developer, high engagement LinkedIn infographic",
    infographicDetails: {
      headerTitle: title,
      subtitle,
      flowchartNodes,
      metricsText,
      takeawayQuote,
      timelineSteps,
    },
    leaveNegativeSpace: false,
  });
}

/**
 * Generate a cohesive set of image prompts for an Instagram or LinkedIn carousel post.
 */
export function buildCarouselPrompts(
  topic: string,
  slideCount: number = 5,
  style: VisualStyle = "3d-render",
  platform: Platform = "INSTAGRAM"
): GeneratedPromptResult[] {
  const prompts: GeneratedPromptResult[] = [];

  for (let i = 1; i <= slideCount; i++) {
    const slideRole =
      i === 1 ? "cover" : i === slideCount ? "call-to-action" : "content";

    const promptResult = buildImagePrompt({
      topic: `${topic} - Slide ${i}: ${
        slideRole === "cover"
          ? "Main Title Hook Visual"
          : slideRole === "call-to-action"
          ? "Conclusion & Save/Follow Call to Action"
          : `Core Content Point #${i - 1}`
      }`,
      style,
      platform,
      carouselInfo: {
        slideNumber: i,
        totalSlides: slideCount,
        slideRole,
      },
      leaveNegativeSpace: true,
    });

    prompts.push(promptResult);
  }

  return prompts;
}

/**
 * Example usage & test helper function
 */
export function getSampleSocialPrompts() {
  const igPost = buildImagePrompt({
    topic: "5 AI Tools That Will Save You 10 Hours a Week",
    style: "dark-mode-ui",
    platform: "INSTAGRAM",
    aspectRatio: "4:5",
    colorPalette: "Deep obsidian black background, electric violet and cyan neon accents",
  });

  const linkedInPost = buildImagePrompt({
    topic: "The Future of Scalable Cloud Architecture in 2026",
    style: "isometric",
    platform: "LINKEDIN",
    aspectRatio: "1.91:1",
    mood: "executive, authoritative, clean corporate tech",
  });

  const backendInfographic = buildTechInfographicPrompt({
    title: "What Happens After Your Request Reaches the Server?",
    subtitle: "A step-by-step journey inside a modern backend application",
    takeawayQuote: "Fast applications don't always use faster databases — they avoid unnecessary database queries.",
    platform: "LINKEDIN",
    aspectRatio: "1.91:1",
  });

  const igCarousel = buildCarouselPrompts(
    "How to Master Next.js Server Components",
    4,
    "glassmorphism",
    "INSTAGRAM"
  );

  return { igPost, linkedInPost, backendInfographic, igCarousel };
}
