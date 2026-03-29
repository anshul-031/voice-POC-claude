# GitHub Copilot Instructions — Responsiveness

To maintain a high standard of responsiveness across the VoiceForge platform, please follow these guidelines when generating UI/CSS code:

## Mobile-First Development
- Always prioritize a mobile-first approach. Define base styles for small screens and use min-width media queries for larger displays.

## Responsive Design Principles
- **Flexible Layouts**: Use Flexbox and CSS Grid for layout management. Avoid fixed widths (px) for containers; use percentages, `vw`, `vh`, `rem`, or `em` instead.
- **Viewport Meta Tag**: Ensure every HTML page includes the `<meta name="viewport" content="width=device-width, initial-scale=1.0">` tag.
- **Responsive Media**: Use `max-width: 100%` and `height: auto` for images and videos to prevent overflow.
- **Typography**: Use relative units like `rem` or `em` for font sizes to ensure they scale correctly with user settings and screen sizes.

## Breakpoints
- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

## Interactive Elements
- Ensure buttons and links are at least 44x44px for touch targets on mobile devices.
- Provide clear visual feedback for hover, active, and focus states.

## Testing
- Always verify that new components look consistent and functional at widths ranging from 320px to 1920px.
