"use client";

// A video the guide added to a step. YouTube and Vimeo links become embeds;
// anything else is played directly. No autoplay, no related-video wall at the
// end — a lesson shouldn't hand a child a rabbit hole.

function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?rel=0&modestbranding=1`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube-nocookie.com/embed/${v}?rel=0&modestbranding=1`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (host === "vimeo.com") {
      return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean)[0]}`;
    }
  } catch {
    return null;
  }
  return null;
}

export default function StepVideo({ url }: { url: string }) {
  const embed = embedUrl(url);
  if (embed) {
    return (
      <div className="step-video">
        <iframe
          src={embed}
          title="Video for this step"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return <video className="step-video-file" src={url} controls preload="metadata" />;
  }
  return (
    <p className="muted">
      <a href={url} target="_blank" rel="noreferrer">
        Open the video for this step →
      </a>
    </p>
  );
}
