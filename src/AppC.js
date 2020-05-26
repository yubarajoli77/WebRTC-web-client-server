import React, { Component } from "react";
import io from "socket.io-client";
import Video from "./component/Video";
import Videos from "./component/VideosC";

class AppC extends Component {
  constructor(props) {
    super(props);
    this.state = {
      localStream: null,
      remoteStream: null,
      remoteStreams: [],
      peerConnections: {},
      selectedVideo: null,
      status: "Please wait...",
      // serverUrl: "https://5bc6a7e7.ngrok.io/",
      serverUrl: "/",
      pcConfig: {
        iceServers: [
          //   {
          //     urls: "stun:numb.viagenie.ca",
          //   },
          //   {
          //     urls: "turn:numb.viagenie.ca",
          //     credential: "numb-@@95",
          //     username: "yuba.oli@amniltech.com",
          //   },
          {
            urls: "stun:stun.l.google.com:19302",
          },
        ],
      },
      sdpConstraints: {
        mandatory: {
          offerToReceiveVideo: true,
          offerToReceiveAudio: true,
        },
      },
      mediaConstraints: {
        audio: true,
        video: true,
        // video:{
        //   width: 1280,
        //   height: 720
        // },
        // video: {
        //   width:{min: 1280}
        // },
        options: {
          mirror: true,
        },
      },
    };

    this.socket = null;
  }

  componentDidMount() {
    this.socket = io.connect(`${this.state.serverUrl}webrtcPeer`, {
      path: "/io/webrtc",
      query: {
        room: window.location.pathname,
      },
    });
    this.socketEventHandler();
  }

  getLocalStream = () => {
    navigator.mediaDevices
      .getUserMedia(this.state.mediaConstraints)
      .then((stream) => {
        this.setState(
          {
            localStream: stream,
          },
          () => this.whoIsOnline()
        );
      })
      .catch((error) => {
        console.log("Error while getting camera ", error);
      });
  };

  socketEventHandler = () => {
    this.socket.on("connection-success", (data) => {
      console.log("On Connection Success", data);
      this.getLocalStream();

      const newStatus =
        data.peerCount > 1
          ? `Total Connected Peers ${data.peerCount} on room ${window.location.pathname}`
          : `Waiting for other peers to connect`;

      this.setState({
        status: newStatus,
      });
    });

    this.socket.on("joined-peers", (data) => {
      console.log("On New Peer Joined ", data);

      const newStatus =
        data.peerCount > 1
          ? `Total Connected Peers ${data.peerCount} on room ${window.location.pathname}`
          : `Waiting for other peers to connect`;

      this.setState({
        status: newStatus,
      });
    });

    this.socket.on("peer-disconnected", (data) => {
      console.log("Peer Disconnected", data);
      const { selectedVideo, remoteStreams } = this.state;
      const newRemoteStreams = [...remoteStreams].filter(
        (stream) => stream.id !== data.socketId
      );
      const newStatus =
        data.peerCount > 1
          ? `Total Connected Peers ${data.peerCount} on room ${window.location.pathname}`
          : `Waiting for other peers to connect`;
      // check if disconnected peer is the selected video and if there still connected peers, then select the first
      if (
        selectedVideo &&
        selectedVideo.id === data.socketId &&
        remoteStreams.length
      )
        this.setState({
          status: newStatus,
          selectedVideo: remoteStreams[0],
          remoteStreams: newRemoteStreams,
        });
    });

    this.socket.on("candidate", (data) => {
      console.log("On Candidate ", data);
      // get remote's peerConnection
      const pc = this.state.peerConnections[data.socketId];
      if (pc) pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    this.socket.on("online-peer", (socketId) => {
      const { sdpConstraints } = this.state;

      //Create new peerConnection to the socketId client
      this.createPeerConnection(socketId, (pc) => {
        //Now create offer for the connected peer
        if (pc) {
          pc.createOffer(sdpConstraints).then(
            (sdp) => {
              pc.setLocalDescription(sdp);

              this.sendToServer("offer", sdp, {
                local: this.socket.id,
                remote: socketId,
              });
            },
            (e) => {
              console.log("Error create offer", e);
            }
          );
        }
      });
    });

    this.socket.on("offer", (data) => {
      console.log("On Offer", data);
      const { sdpConstraints, localStream } = this.state;
      this.createPeerConnection(data.socketId, (pc) => {
        if (pc) {
          pc.addStream(localStream);
          pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(
            () => {
              //Create Answer
              pc.createAnswer(sdpConstraints).then(
                (sdp) => {
                  pc.setLocalDescription(sdp);

                  this.sendToServer("answer", sdp, {
                    local: this.socket.id,
                    remote: data.socketId,
                  });
                },
                (e) => {
                  console.log("Error create answer", e);
                }
              );
            }
          );
        }
      });
    });

    this.socket.on("answer", (data) => {
      console.log("On Answer", data);
      // get remote's peerConnection
      const { peerConnections, remoteStreams } = this.state;

      const pc = peerConnections[data.socketId];
      pc.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      ).then(() => {});
    });
  };

  createPeerConnection = (socketId, callback) => {
    const {
      peerConnections,
      pcConfig,
      remoteStreams,
      selectedVideo,
      localStream,
    } = this.state;
    try {
      let pc = new RTCPeerConnection(pcConfig);

      //add pc to the collection of peerconnections i.e peerConnections
      const tempPcConnections = { ...peerConnections };
      tempPcConnections[socketId] = pc;
      this.setState({
        peerConnections: tempPcConnections,
      });

      pc.onicecandidate = (e) => {
        console.log("On Ice Candidate", e);
        if (e.candidate) {
          this.sendToServer("candidate", e.candidate, {
            local: this.socket.id,
            remote: socketId,
          });
        }
      };

      pc.oniceconnectionstatechange = (e) => {
        // console.log("Ice connection changed", e);
        // if (pc.connectionState === "disconnected") {
        //   const newRemoteStreams = remoteStreams.filter(
        //     (stream) => stream.id !== socketId
        //   );
        //   setRemoteStream(
        //     (newRemoteStreams.length > 0 && newRemoteStreams[0].stream) || null
        //   );
        // }
      };

      pc.ontrack = (e) => {
        console.log("On Track", e);
        let _remoteStream = null;
        let remoteStreams = this.state.remoteStreams;
        let remoteVideo = {};

        // 1. check if stream already exists in remoteStreams
        const rVideos = this.state.remoteStreams.filter(
          (stream) => stream.id === socketId
        );

        // 2. if it does exist then add track
        if (rVideos.length) {
          _remoteStream = rVideos[0].stream;
          _remoteStream.addTrack(e.track, _remoteStream);
          remoteVideo = {
            ...rVideos[0],
            stream: _remoteStream,
          };
          remoteStreams = this.state.remoteStreams.map((_remoteVideo) => {
            return (
              (_remoteVideo.id === remoteVideo.id && remoteVideo) ||
              _remoteVideo
            );
          });
        } else {
          // 3. if not, then create new stream and add track
          _remoteStream = new MediaStream();
          _remoteStream.addTrack(e.track, _remoteStream);

          remoteVideo = {
            id: socketId,
            name: socketId,
            stream: _remoteStream,
          };
          remoteStreams = [...remoteStreams, remoteVideo];
        }

        // const remoteVideo = {
        //   id: socketId,
        //   name: socketId,
        //   stream: e.streams[0],
        // };

        // If there is already stream in display let it stay the same, otherwise use the latest stream
        if (remoteStreams.length <= 0)
          this.setState({ remoteStream: _remoteStream });

        // get currently selected video
        let tempSelectedVdo = [...this.state.remoteStreams].filter(
          (stream) => selectedVideo && stream.id === selectedVideo.id
        );
        // if the video is still in the list, then do nothing, otherwise set to new video stream
        if (!tempSelectedVdo.length)
          this.setState({ selectedVideo: remoteVideo, remoteStreams });

        // const tempRemoteStreams = [...remoteStreams];
        // tempRemoteStreams.push(remoteVideo);

        // this.setState({ remoteStreams: tempRemoteStreams });
      };

      pc.close = () => {
        console.log("On PC Close");
      };

      if (this.state.localStream)
        //   pc.addStream(localStream);

        this.state.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.state.localStream);
        });

      callback(pc);
    } catch (error) {
      console.log("Error while creating peer connections", error);
      callback(null);
    }
  };

  whoIsOnline = () => {
    this.sendToServer("onlinePeers", null, { local: this.socket.id });
  };

  sendToServer = (type, payload, socketId) => {
    this.socket.emit(type, {
      socketId,
      payload,
    });
  };

  statusTextView = () => {
    const { status } = this.state;
    return <div style={{ padding: 8, color: "yellow" }}>{status}</div>;
  };

  render() {
    const { selectedVideo, remoteStreams, localStream } = this.state;
    return (
      <div>
        <Video
          videoStyle={{
            position: "absolute",
            width: 200,
            zIndex: 2,
            // right: 0,
            // height: 300,
            // margin: 8,
            // background: "#0f0f0f",
          }}
          frameStyle={{
            width: 200,
            margin: 5,
            borderRadius: 5,
            backgroundColor: "black",
          }}
          videoStream={localStream}
          autoPlay
          muted
        />
        <Video
          videoStyle={{
            height: "100%",
            width: "100%",
            background: "#0f0f0f",
            zIndex: 1,
            position: "fixed",
            bottom: 0,
          }}
          videoStream={selectedVideo && selectedVideo.stream}
          autoPlay
          muted
        />
        <br />
        <div
          style={{
            zIndex: 3,
            position: "absolute",
            // margin: 6,
            // padding: 6,
            // borderRadius: 6,
            // backgroundColor: "#cdc4ff4f",
          }}
        >
          <div
            style={{
              margin: 10,
              backgroundColor: "#cdc4ff4f",
              padding: 10,
              borderRadius: 5,
            }}
          >
            {this.statusTextView()}
          </div>
        </div>
        <div>
          <Videos
            switchVideo={(video) => this.setState({ selectedVideo: video })}
            remoteStreams={this.state.remoteStreams}
          />
        </div>
      </div>
    );
  }
}

export default AppC;
