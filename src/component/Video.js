import React, { useEffect, useState } from "react";

function Video(props) {
  const [video, setVideo] = useState(null);
  const [mic, setMic] = useState(true)
  const [camera, setCamera] = useState(true)

  useEffect(() => {
      // console.log("Video Props ", props)
    if (video && props.videoStream) video.srcObject = props.videoStream;
  }, [props.videoStream]);


  const muteMic = (e)=>{
    const stream = video.srcObject.getTracks().filter(track => track.kind === 'audio');
    if(stream) stream[0].enabled = !mic;
    setMic(!mic)
  }

  const disableCamera = (e)=>{
    const stream = video.srcObject.getTracks().filter(track => track.kind === 'video');
    if(stream) stream[0].enabled = !camera;
    setCamera(!camera)
  }

  const muteControls = props.showMuteControls && (
    <div>
      <i onClick={muteMic} style={{ cursor: 'pointer', padding: 5, fontSize: 20, color: mic && 'white' || 'red' }} class='material-icons'>{mic && 'mic' || 'mic_off'}</i>
      <i onClick={disableCamera} style={{ cursor: 'pointer', padding: 5, fontSize: 20, color: camera && 'white' || 'red' }} class='material-icons'>{camera && 'videocam' || 'videocam_off'}</i>
    </div>
  )

  return (
    
    <div style={{ ...props.frameStyle }}>
      <video
        style={{ ...props.videoStyle }}
        ref={props.videoStream}
        id={props.id}
        muted={props.muted}
        autoPlay
        ref={(ref) => setVideo(ref)}
      />
      {muteControls}
    </div>
  );
}

export default Video;
