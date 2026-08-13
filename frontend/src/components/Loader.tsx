export default function Loader() {
  return (
    <div className="message-bubble-wrapper assistant">
      <div className="avatar">🤖</div>
      <div className="bubble loader-bubble">
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}
