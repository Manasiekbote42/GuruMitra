import cv2
import mediapipe as mp
import numpy as np
import matplotlib.pyplot as plt
import os

# Optional: YOLO for phone detection (graceful fallback if not installed)
_phone_detector = None
def _get_phone_detector():
    global _phone_detector
    if _phone_detector is None:
        try:
            from ultralytics import YOLO
            _phone_detector = YOLO("yolov8n.pt")  # nano model, COCO includes "cell phone" (class 67)
        except Exception:
            _phone_detector = False  # disabled
    return _phone_detector if _phone_detector else None


# COCO class index for cell phone
COCO_CLASS_CELL_PHONE = 67


class PostureAnalyzer:
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.mp_face_mesh = mp.solutions.face_mesh
        self.pose = self.mp_pose.Pose(static_image_mode=True)
        self.face_mesh = self.mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, min_detection_confidence=0.5)

    def _is_eye_contact_frame(self, image_rgb):
        """Estimate if teacher is looking at camera (eye contact) using face mesh. Returns True if frontal face."""
        results = self.face_mesh.process(image_rgb)
        if not results.multi_face_landmarks:
            return False
        lm = results.multi_face_landmarks[0]
        # Nose tip = 1, face center proxy: nose x should be near 0.5, nose y in upper half
        nose = lm.landmark[1]
        # Frontal = nose near center of frame (x ~ 0.5), facing camera (not turned away)
        if abs(nose.x - 0.5) > 0.25 or nose.y > 0.55:
            return False
        return True

    def _has_phone_in_frame(self, frame_bgr):
        """Run YOLO to detect cell phone in frame. Returns True if phone detected."""
        model = _get_phone_detector()
        if model is None:
            return False
        try:
            results = model(frame_bgr, verbose=False)
            for r in results:
                if r.boxes is None:
                    continue
                for cls in r.boxes.cls.cpu().numpy():
                    if int(cls) == COCO_CLASS_CELL_PHONE:
                        return True
        except Exception:
            pass
        return False

    def analyze_video(self, video_path, output_dir="posture_outputs"):
        cap = cv2.VideoCapture(video_path)
        frame_count = 0
        slouch_frames = 0
        raised_shoulder_frames = 0
        head_tilt_angles = []
        neck_alignments = []
        hand_positions = []
        body_orientations = []
        movement_dynamics = []
        gesture_count = 0
        spine_angles = []
        annotated_frames = []
        prev_landmarks = None
        # New metrics: eye contact, phone usage, reading vs explaining
        eye_contact_frames = 0
        eye_contact_analyzed_count = 0
        phone_frames = 0
        phone_analyzed_count = 0
        reading_posture_frames = 0  # head down, e.g. reading from textbook
        pose_detected_frames = 0    # frames where pose was detected (for reading % denominator)

        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # Sample frames at intervals to avoid duplicates
        save_interval = 10  # Save at every 10th frame with issue
        eye_contact_sample = 5   # run face mesh every 5th frame
        phone_sample = 10       # run YOLO every 10th frame
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame_count += 1
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.pose.process(image_rgb)
            if results.pose_landmarks:
                pose_detected_frames += 1
                landmarks = results.pose_landmarks.landmark
                # Shoulders, hips, knees
                left_shoulder = landmarks[self.mp_pose.PoseLandmark.LEFT_SHOULDER]
                right_shoulder = landmarks[self.mp_pose.PoseLandmark.RIGHT_SHOULDER]
                left_hip = landmarks[self.mp_pose.PoseLandmark.LEFT_HIP]
                right_hip = landmarks[self.mp_pose.PoseLandmark.RIGHT_HIP]
                left_knee = landmarks[self.mp_pose.PoseLandmark.LEFT_KNEE]
                right_knee = landmarks[self.mp_pose.PoseLandmark.RIGHT_KNEE]
                nose = landmarks[self.mp_pose.PoseLandmark.NOSE]
                left_hand = landmarks[self.mp_pose.PoseLandmark.LEFT_WRIST]
                right_hand = landmarks[self.mp_pose.PoseLandmark.RIGHT_WRIST]

                # Average points for center
                shoulder = np.mean([[left_shoulder.x, left_shoulder.y], [right_shoulder.x, right_shoulder.y]], axis=0)
                hip = np.mean([[left_hip.x, left_hip.y], [right_hip.x, right_hip.y]], axis=0)
                knee = np.mean([[left_knee.x, left_knee.y], [right_knee.x, right_knee.y]], axis=0)

                # Calculate spine angle
                v1 = np.array(shoulder) - np.array(hip)
                v2 = np.array(knee) - np.array(hip)
                angle = self.angle_between(v1, v2)
                spine_angles.append(angle)
                if angle < 170 and angle >= 150:
                    slouch_frames += 1
                elif angle < 150:
                    slouch_frames += 1

                # Shoulder elevation (y is top-down in image)
                shoulder_elevation = (left_shoulder.y + right_shoulder.y) / 2
                hip_elevation = (left_hip.y + right_hip.y) / 2
                if shoulder_elevation < hip_elevation - 0.05:
                    raised_shoulder_frames += 1

                # Head tilt angle
                shoulder_mid = np.mean([[left_shoulder.x, left_shoulder.y], [right_shoulder.x, right_shoulder.y]], axis=0)
                nose_xy = np.array([nose.x, nose.y])
                head_tilt = np.arctan2(nose_xy[1] - shoulder_mid[1], nose_xy[0] - shoulder_mid[0]) * 180 / np.pi
                head_tilt_angles.append(head_tilt)

                # Neck alignment
                neck_alignment = np.linalg.norm(nose_xy - shoulder_mid)
                neck_alignments.append(neck_alignment)

                # Hand position (simple: above/below shoulder)
                hand_positions.append({
                    "left": "above" if left_hand.y < left_shoulder.y else "below",
                    "right": "above" if right_hand.y < right_shoulder.y else "below"
                })

                # Body orientation (simple: left/right facing)
                body_orientations.append("left" if left_shoulder.x < right_shoulder.x else "right")

                # Movement dynamics (distance between frames)
                if prev_landmarks:
                    movement = np.linalg.norm(np.array([nose.x, nose.y]) - np.array([prev_landmarks[0], prev_landmarks[1]]))
                    movement_dynamics.append(movement)
                prev_landmarks = [nose.x, nose.y]

                # Gesture frequency (hands above shoulder)
                if hand_positions[-1]["left"] == "above" or hand_positions[-1]["right"] == "above":
                    gesture_count += 1

                # Reading vs explaining: head down (e.g. reading from textbook) = nose below shoulder line
                head_down_threshold = 0.08
                if nose.y > shoulder_mid[1] + head_down_threshold:
                    reading_posture_frames += 1

                # Eye contact: sample every N frames (face mesh is heavier)
                if frame_count % eye_contact_sample == 0:
                    eye_contact_analyzed_count += 1
                    if self._is_eye_contact_frame(image_rgb):
                        eye_contact_frames += 1

                # Phone usage: sample every M frames (YOLO is heavier)
                if frame_count % phone_sample == 0:
                    phone_analyzed_count += 1
                    if self._has_phone_in_frame(frame):
                        phone_frames += 1

                # Annotate and save up to 5 unique frames if posture issue detected, spaced by interval
                if (angle < 150 or abs(head_tilt) > 15) and len(annotated_frames) < 5 and (frame_count % save_interval == 0):
                    annotated_path = os.path.join(output_dir, f"frame_{frame_count}.jpg")
                    annotated_frame = frame.copy()
                    self.draw_skeleton(annotated_frame, results.pose_landmarks)
                    cv2.putText(annotated_frame, "Posture Issue", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)
                    cv2.imwrite(annotated_path, annotated_frame)
                    annotated_frames.append(annotated_path)

        cap.release()

        slouch_percent = (slouch_frames / frame_count) * 100 if frame_count else 0
        raised_shoulder_percent = (raised_shoulder_frames / frame_count) * 100 if frame_count else 0
        avg_spine_angle = np.mean(spine_angles) if spine_angles else 0
        avg_head_tilt = np.mean(head_tilt_angles) if head_tilt_angles else 0
        avg_neck_alignment = np.mean(neck_alignments) if neck_alignments else 0
        avg_movement = np.mean(movement_dynamics) if movement_dynamics else 0

        # New metrics
        eye_contact_percent = (eye_contact_frames / eye_contact_analyzed_count * 100) if eye_contact_analyzed_count else None
        phone_usage_percent = None
        if phone_analyzed_count and _get_phone_detector() is not None:
            phone_usage_percent = (phone_frames / phone_analyzed_count * 100)
        denom = pose_detected_frames if pose_detected_frames else frame_count
        reading_posture_percent = (reading_posture_frames / denom * 100) if denom else 0
        explaining_posture_percent = 100.0 - reading_posture_percent if denom else 0

        # Generate heatmap for movement
        heatmap_path = os.path.join(output_dir, "movement_heatmap.png")
        if movement_dynamics:
            plt.figure()
            plt.plot(movement_dynamics)
            plt.title("Movement Dynamics")
            plt.xlabel("Frame")
            plt.ylabel("Movement")
            plt.savefig(heatmap_path)
            plt.close()
        else:
            heatmap_path = None

        # Feedback
        feedback = []
        if raised_shoulder_percent > 10:
            feedback.append("Shoulders remained raised during explanation—may indicate stress.")
        if slouch_percent > 20:
            feedback.append(f"Slouching observed for {slouch_percent:.1f}% of lecture time.")
        if avg_spine_angle >= 170:
            feedback.append("Good posture maintained.")
        elif avg_spine_angle >= 150:
            feedback.append("Teacher tends to lean forward while explaining concepts.")
        else:
            feedback.append("Poor posture detected. Consider sitting/standing straighter.")
        if abs(avg_head_tilt) > 10:
            feedback.append("Head tilt detected. Try to keep your head level for better engagement.")
        else:
            feedback.append("Good head alignment maintained.")
        if avg_neck_alignment > 0.1:
            feedback.append("Neck protrusion detected. Keep neck aligned with spine.")
        if gesture_count < 5:
            feedback.append("Increase hand gestures for better engagement.")

        # Eye contact feedback
        if eye_contact_percent is not None:
            if eye_contact_percent >= 60:
                feedback.append(f"Good eye contact maintained ({eye_contact_percent:.0f}% of the time).")
            elif eye_contact_percent >= 40:
                feedback.append(f"Moderate eye contact ({eye_contact_percent:.0f}%). Try to look at the class more often.")
            else:
                feedback.append(f"Low eye contact ({eye_contact_percent:.0f}%). Maintain more eye contact with students.")

        # Phone usage feedback
        if phone_usage_percent is not None and phone_usage_percent > 5:
            feedback.append("Phone usage detected during class. Avoid using phone while teaching.")
        elif phone_usage_percent is not None:
            feedback.append("No phone usage detected—good focus during the session.")

        # Reading vs explaining feedback
        if reading_posture_percent > 40:
            feedback.append(f"Teacher was reading from materials for {reading_posture_percent:.0f}% of the session. Focus on explaining and engaging with students rather than reading from textbook.")
        elif reading_posture_percent > 20:
            feedback.append(f"Some time spent looking down at materials ({reading_posture_percent:.0f}%). Balance with more direct explanation.")
        else:
            feedback.append(f"Good balance: explaining posture for {explaining_posture_percent:.0f}% of the session.")

        # Recommendations
        recommendations = []
        if slouch_percent > 20:
            recommendations.append("Try back stretches and posture correction exercises.")
        if abs(avg_head_tilt) > 10:
            recommendations.append("Practice keeping your head level during explanations.")
        if gesture_count < 5:
            recommendations.append("Use more hand gestures to emphasize points.")
        if eye_contact_percent is not None and eye_contact_percent < 50:
            recommendations.append("Practice maintaining eye contact with the class; look at the camera or students when explaining.")
        if phone_usage_percent is not None and phone_usage_percent > 5:
            recommendations.append("Keep phone away during teaching hours to stay focused and set a good example.")
        if reading_posture_percent > 30:
            recommendations.append("Reduce reading from textbook; explain concepts in your own words and use the board or gestures.")

        # Convert annotated image paths to URLs for frontend (assuming /static/posture_outputs is served)
        base_url = "http://localhost:8000/static/posture_outputs"  # Adjust if needed
        annotated_images_urls = [
            f"{base_url}/{os.path.basename(path)}" for path in annotated_frames
        ]
        heatmap_url = f"{base_url}/{os.path.basename(heatmap_path)}" if heatmap_path else None

        # If no posture issues detected, provide a default feedback message
        if not feedback:
            feedback = ["No posture issues detected in the video."]
        if not annotated_images_urls:
            # Log for debugging
            print("[PostureAnalyzer] No annotated frames found: no posture issues detected or video too short.")

        return {
            "shoulder_tension_percent": raised_shoulder_percent,
            "slouch_percent": slouch_percent,
            "avg_spine_angle": avg_spine_angle,
            "avg_head_tilt_angle": avg_head_tilt,
            "avg_neck_alignment": avg_neck_alignment,
            "avg_movement": avg_movement,
            "gesture_count": gesture_count,
            "eye_contact_percent": eye_contact_percent,
            "phone_usage_percent": phone_usage_percent,
            "reading_posture_percent": reading_posture_percent,
            "explaining_posture_percent": explaining_posture_percent,
            "feedback": feedback,
            "recommendations": recommendations,
            "annotated_images": annotated_images_urls,
            "heatmap": heatmap_url
        }

    def draw_skeleton(self, image, pose_landmarks):
        mp_drawing = mp.solutions.drawing_utils
        mp_drawing.draw_landmarks(
            image,
            pose_landmarks,
            self.mp_pose.POSE_CONNECTIONS,
            mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
            mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2, circle_radius=2),
        )

    @staticmethod
    def angle_between(v1, v2):
        v1_u = v1 / np.linalg.norm(v1)
        v2_u = v2 / np.linalg.norm(v2)
        angle = np.arccos(np.clip(np.dot(v1_u, v2_u), -1.0, 1.0))
        return np.degrees(angle)