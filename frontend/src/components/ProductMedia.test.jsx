import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductMedia, { mediaTypeForUrl } from "./ProductMedia.jsx";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

it("keeps a playable video when autoplay is blocked and offers custom controls", async () => {
  const user = userEvent.setup();
  HTMLMediaElement.prototype.play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
  const { container } = render(<ProductMedia product={{media_url:"https://example.com/video.mp4", media_type:"video"}} alt="Produto" />);
  const video = container.querySelector("video");
  expect(video.muted).toBe(true);
  expect(video.controls).toBe(false);
  await screen.findByText("Toque para reproduzir");
  expect(container.querySelector("video")).toBe(video);
  await user.click(screen.getByRole("button", {name:"Reproduzir vídeo"}));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  fireEvent.play(video);
  await user.click(screen.getByRole("button", {name:"Pausar vídeo"}));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  await user.click(screen.getByRole("button", {name:"Ativar som"}));
  expect(video.muted).toBe(false);
});

it("reports an invalid URL after both media decoders fail and recovers on source change", async () => {
  const { container, rerender } = render(<ProductMedia product={{media_url:"https://example.com/missing"}} alt="Produto" />);
  fireEvent.error(screen.getByRole("img"));
  fireEvent.error(container.querySelector("video"));
  expect(screen.getByRole("status")).toHaveTextContent("Não foi possível carregar");
  rerender(<ProductMedia product={{media_url:"https://example.com/new.gif"}} alt="Produto" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/new.gif");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("detects a video filename in a signed query and keeps static uploads as images", async () => {
  const url = "https://example.com/download?filename=demo.webm&signature=abc";
  expect(mediaTypeForUrl(url)).toBe("video");
  const { container, rerender } = render(<ProductMedia product={{media_url:url}} alt="Produto" />);
  await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", url));
  rerender(<ProductMedia product={{image_data:"data:image/jpeg;base64,AAAA", media_type:"video"}} alt="Produto" />);
  expect(screen.getByRole("img")).toBeInTheDocument();
  expect(container.querySelector("video")).toBeNull();
});
