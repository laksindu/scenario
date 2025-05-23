// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBMJKa9nkD5iQr5JrTmRM6AAD08ssKZ5dg",
  authDomain: "anonymouschat-7349b.firebaseapp.com",
  databaseURL: "https://anonymouschat-7349b-default-rtdb.firebaseio.com",
  projectId: "anonymouschat-7349b",
  storageBucket: "anonymouschat-7349b.firebasestorage.app",
  messagingSenderId: "102390154152",
  appId: "1:102390154152:web:49f40653b653d48039939d"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// DOM elements
const signInButton = document.getElementById('signInButton');
const userDetails = document.getElementById('userDetails');
const roomControls = document.getElementById('room-controls'); // Contains room-id, create-room, join-room
const chatArea = document.getElementById('chat-area');
const messageInputContainer = document.getElementById('message-input'); // The div containing message input and send button
const activeRoomInfo = document.getElementById('active-room-info'); // Contains currentRoomDisplay and leaveRoomButton

const roomIDInput = document.getElementById('room-id');
const createRoomButton = document.getElementById('create-room');
const joinRoomButton = document.getElementById('join-room');
const currentRoomDisplay = document.getElementById('currentRoomDisplay');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const messageTextInput = document.getElementById('message'); // actual text input for message
const sendMessageButton = document.getElementById('send-message'); // send button

// Initially hide chat UI elements that should only be visible after sign-in and room selection
roomControls.style.display = 'none';
chatArea.style.display = 'none';
messageInputContainer.style.display = 'none';
activeRoomInfo.style.display = 'none';

// Global variable for current room
let currentRoomId = null;
let messagesRef = null; // To store the reference to current room's messages
let messageAddedListener = null; // To store the listener for child_added
let messageRemovedListener = null; // To store the listener for child_removed


// DOM elements (ensure messageTextInput and sendMessageButton are correctly identified)
// ... (assuming previous DOM element definitions are correct)
const selectFileButton = document.getElementById('selectFileButton');
const fileInput = document.getElementById('fileInput');
const uploadProgressArea = document.getElementById('upload-progress-area');
const progressPercentage = document.getElementById('progress-percentage');


// Function to display a message
function displayMessage(key, messageData) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message-item');
  messageElement.setAttribute('data-message-key', key);

  // Add class based on sender
  if (auth.currentUser && messageData.uid === auth.currentUser.uid) {
    messageElement.classList.add('my-message');
  } else {
    messageElement.classList.add('other-message');
  }

  const sender = messageData.uid === auth.currentUser.uid ? 'You' : `User ${messageData.uid.substring(0, 6)}...`;
  
  const senderElement = document.createElement('strong');
  senderElement.textContent = `${sender}: `;
  messageElement.appendChild(senderElement);

  // Display text message or file/image
  if (messageData.text) {
    const textNode = document.createTextNode(messageData.text); // Append text directly to messageElement after sender
    messageElement.appendChild(textNode);
  } else if (messageData.fileURL) {
    if (messageData.fileType && messageData.fileType.startsWith('image/')) {
      const imgElement = document.createElement('img');
      imgElement.src = messageData.fileURL;
      imgElement.alt = messageData.fileName || 'Uploaded Image';
      imgElement.style.maxWidth = '200px';
      imgElement.style.maxHeight = '200px';
      imgElement.style.display = 'block'; // Make it a block element for better layout
      messageElement.appendChild(imgElement);
    } else {
      const linkElement = document.createElement('a');
      linkElement.href = messageData.fileURL;
      linkElement.textContent = messageData.fileName || 'Download File';
      linkElement.target = '_blank';
      if (messageData.fileName) {
        linkElement.download = messageData.fileName;
      }
      messageElement.appendChild(linkElement);
    }
  }

  // Add timestamp
  if (messageData.timestamp) {
    const timestampElement = document.createElement('span');
    timestampElement.classList.add('timestamp');
    timestampElement.style.fontSize = '0.8em';
    timestampElement.style.marginLeft = '10px';
    timestampElement.textContent = `(${new Date(messageData.timestamp).toLocaleTimeString()}) `;
    messageElement.appendChild(timestampElement);
  }

  // Add Delete button if message is from current user
  if (auth.currentUser && messageData.uid === auth.currentUser.uid) { // Ensure auth.currentUser exists
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.classList.add('delete-button');
    // Event listener for delete button (remains the same)
    deleteButton.addEventListener('click', () => {
      if (confirm("Are you sure you want to delete this message?")) {
        database.ref('messages/' + currentRoomId + '/' + key).remove()
          .then(() => console.log("Message deleted successfully by user:", key))
          .catch(error => {
            console.error("Error deleting message:", error);
            alert("Error deleting message.");
          });
      }
    });
    messageElement.appendChild(deleteButton); // Appended after timestamp
  }

  chatArea.appendChild(messageElement);
  chatArea.scrollTop = chatArea.scrollHeight; // Scroll to bottom
}

// Function to clear messages and detach listener
function clearMessagesAndListener() {
  if (messagesRef) {
    if (messageAddedListener) {
      messagesRef.off('child_added', messageAddedListener);
      console.log('Detached child_added listener for room:', currentRoomId);
    }
    if (messageRemovedListener) {
      messagesRef.off('child_removed', messageRemovedListener);
      console.log('Detached child_removed listener for room:', currentRoomId);
    }
  }
  chatArea.innerHTML = '';
  messagesRef = null;
  messageAddedListener = null;
  messageRemovedListener = null;
}

// Event listener for sign-in button
signInButton.addEventListener('click', () => {
  auth.signInAnonymously()
    .then((userCredential) => {
      // Signed in successfully
      const user = userCredential.user;
      userDetails.textContent = `Signed in as: ${user.uid}`;
      signInButton.style.display = 'none'; // Hide sign-in button
      // Show chat UI
      roomControls.style.display = 'block';
      chatArea.style.display = 'block';
      messageInput.style.display = 'block';
    })
    .catch((error) => {
      console.error("Anonymous sign-in failed:", error);
      userDetails.textContent = `Error: ${error.message}`;
    });
});

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    // User is signed in
    console.log("User signed in:", user.uid);
    userDetails.textContent = `Signed in as: ${user.uid}`;
    signInButton.style.display = 'none';
    if (!currentRoomId) { // Only show room controls if not already in a room
      roomControls.style.display = 'block';
    } else {
      // User is signed in AND in a room, ensure message input is visible
      messageInputContainer.style.display = 'block';
      activeRoomInfo.style.display = 'block'; // Also show room info
    }
    chatArea.style.display = 'block'; // Chat area is always visible if signed in
  } else {
    // User is signed out
    clearMessagesAndListener(); // Clear messages and detach listener
    currentRoomId = null; // Reset room ID

    console.log("User signed out");
    userDetails.textContent = 'Not signed in.';
    signInButton.style.display = 'block';
    roomControls.style.display = 'none';
    chatArea.style.display = 'none';
    messageInputContainer.style.display = 'none';
    activeRoomInfo.style.display = 'none';
  }
});

// Function to setup message listening for a room
function setupMessageListener(roomId) {
  clearMessagesAndListener(); // Clear any old listeners and messages

  currentRoomId = roomId;
  messagesRef = database.ref('messages/' + currentRoomId);
  
  // Listener for new messages
  messageAddedListener = messagesRef.orderByChild('timestamp').on('child_added', snapshot => {
    displayMessage(snapshot.key, snapshot.val());
  });
  console.log('Attached child_added listener for room:', currentRoomId);

  // Listener for removed messages
  messageRemovedListener = messagesRef.on('child_removed', snapshot => {
    const deletedMessageKey = snapshot.key;
    const messageElementToRemove = chatArea.querySelector(`[data-message-key="${deletedMessageKey}"]`);
    if (messageElementToRemove) {
      messageElementToRemove.remove();
      console.log("Message element removed from UI:", deletedMessageKey);
    }
  });
  console.log('Attached child_removed listener for room:', currentRoomId);
}

// Event Listener for selectFileButton
selectFileButton.addEventListener('click', () => {
  if (!currentRoomId) {
    alert("Please join a room before sending a file.");
    return;
  }
  if (!auth.currentUser) {
    alert("Please sign in before sending a file.");
    return;
  }
  fileInput.click(); // Trigger hidden file input
});

// Event Listener for fileInput "change"
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file || !currentRoomId || !auth.currentUser) {
    fileInput.value = ''; // Reset file input
    return;
  }

  const timestamp = Date.now();
  const filePath = `uploads/${currentRoomId}/${auth.currentUser.uid}/${timestamp}-${file.name}`;
  const fileRef = storage.ref(filePath);

  const uploadTask = fileRef.put(file);

  uploadProgressArea.style.display = 'block'; // Show progress area

  uploadTask.on('state_changed',
    (snapshot) => {
      // Progress
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      progressPercentage.textContent = Math.round(progress);
      console.log('Upload is ' + progress + '% done');
    },
    (error) => {
      // Error
      console.error("Upload failed:", error);
      alert("Upload failed: " + error.message);
      uploadProgressArea.style.display = 'none'; // Hide progress area
      fileInput.value = ''; // Reset file input
    },
    () => {
      // Completion
      uploadProgressArea.style.display = 'none'; // Hide progress area
      uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
        console.log('File available at', downloadURL);

        const message = {
          uid: auth.currentUser.uid,
          timestamp: firebase.database.ServerValue.TIMESTAMP,
          fileURL: downloadURL,
          fileName: file.name,
          fileType: file.type
        };

        database.ref('messages/' + currentRoomId).push(message)
          .then(() => {
            console.log("File message sent successfully!");
          })
          .catch((error) => {
            console.error("Error sending file message:", error);
            alert("Error sending file message.");
          });
      });
      fileInput.value = ''; // Reset file input
    }
  );
});


// Event Listener for createRoomButton
createRoomButton.addEventListener('click', () => {
  const newRoomKey = database.ref('rooms').push().key;
  
  // Store basic room metadata
  database.ref(`rooms/${newRoomKey}`).set({
    createdBy: auth.currentUser.uid,
    createdAt: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    currentRoomDisplay.textContent = newRoomKey;
    // Update UI
    roomControls.style.display = 'none';
    messageInputContainer.style.display = 'block';
    activeRoomInfo.style.display = 'block';
    setupMessageListener(newRoomKey); // Set up listener for the new room
  }).catch(error => {
    console.error("Error creating room:", error);
    alert("Error creating room.");
  });
});

// Event Listener for joinRoomButton
joinRoomButton.addEventListener('click', () => {
  const roomIdToJoin = roomIDInput.value.trim();
  if (!roomIdToJoin) {
    alert("Please enter a Room ID.");
    return;
  }

  database.ref(`rooms/${roomIdToJoin}`).once('value', snapshot => {
    if (snapshot.exists()) {
      currentRoomDisplay.textContent = roomIdToJoin;
      // Update UI
      roomControls.style.display = 'none';
      messageInputContainer.style.display = 'block';
      activeRoomInfo.style.display = 'block';
      roomIDInput.value = ''; // Clear input
      setupMessageListener(roomIdToJoin); // Set up listener for the joined room
    } else {
      alert("Room does not exist. Please check the Room ID or create a new room.");
    }
  });
});

// Event Listener for leaveRoomButton
leaveRoomButton.addEventListener('click', () => {
  clearMessagesAndListener(); // Detach listener and clear messages
  currentRoomId = null; // Essential to set this before UI changes
  
  currentRoomDisplay.textContent = '';
  roomControls.style.display = 'block'; // Show room creation/joining
  messageInputContainer.style.display = 'none'; // Hide message input
  activeRoomInfo.style.display = 'none'; // Hide current room info
  // chatArea is already cleared by clearMessagesAndListener
});

// Event Listener for sendMessageButton
sendMessageButton.addEventListener('click', () => {
  const messageText = messageTextInput.value.trim();

  if (messageText === '') {
    return; // Do nothing if message is empty
  }

  if (!currentRoomId) {
    alert("You must be in a room to send a message.");
    return;
  }

  if (!auth.currentUser) {
    alert("You must be signed in to send a message.");
    return;
  }

  const message = {
    uid: auth.currentUser.uid,
    text: messageText,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  database.ref('messages/' + currentRoomId).push(message)
    .then(() => {
      messageTextInput.value = ''; // Clear input field
      console.log("Message sent successfully!");
    })
    .catch((error) => {
      console.error("Error sending message:", error);
      alert("Error sending message.");
    });
});
