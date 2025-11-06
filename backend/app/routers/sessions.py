from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import uuid

from ..database import get_db
from ..models import InterviewSession, SessionMessage
from ..schemas import (
    InterviewSessionCreate, 
    InterviewSession as InterviewSessionSchema,
    InterviewSessionList,
    SessionMessageCreate,
    SessionMessage as SessionMessageSchema
)

router = APIRouter()

@router.post("/", response_model=InterviewSessionSchema)
async def create_session(
    session: InterviewSessionCreate,
    db: Session = Depends(get_db)
):
    """创建新会话（无需认证）"""
    session_id = str(uuid.uuid4())
    
    db_session = InterviewSession(
        session_id=session_id,
        title=session.title or f"Interview Session - {session_id[:8]}"
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    
    return db_session

@router.get("/", response_model=List[InterviewSessionList])
async def get_user_sessions(
    db: Session = Depends(get_db)
):
    """获取所有会话（无需认证）"""
    sessions = db.query(
        InterviewSession,
        func.count(SessionMessage.id).label('message_count')
    ).outerjoin(SessionMessage).group_by(
        InterviewSession.id
    ).order_by(
        InterviewSession.updated_at.desc()
    ).all()
    
    result = []
    for session, message_count in sessions:
        result.append({
            "id": session.id,
            "session_id": session.session_id,
            "title": session.title,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "message_count": message_count or 0
        })
    
    return result

@router.get("/{session_id}", response_model=InterviewSessionSchema)
async def get_session(
    session_id: str,
    db: Session = Depends(get_db)
):
    """获取单个会话（无需认证）"""
    session = db.query(InterviewSession).filter(
        InterviewSession.session_id == session_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return session

@router.post("/{session_id}/messages", response_model=SessionMessageSchema)
async def add_message_to_session(
    session_id: str,
    message: SessionMessageCreate,
    db: Session = Depends(get_db)
):
    """添加消息到会话（无需认证）"""
    session = db.query(InterviewSession).filter(
        InterviewSession.session_id == session_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    db_message = SessionMessage(
        session_id=session.id,
        message_type=message.message_type,
        content=message.content,
        message_metadata=message.message_metadata
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    
    # Update session timestamp
    from datetime import datetime
    session.updated_at = datetime.utcnow()
    db.commit()
    
    return db_message

@router.get("/{session_id}/messages", response_model=List[SessionMessageSchema])
async def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db)
):
    """获取会话消息（无需认证）"""
    session = db.query(InterviewSession).filter(
        InterviewSession.session_id == session_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    messages = db.query(SessionMessage).filter(
        SessionMessage.session_id == session.id
    ).order_by(SessionMessage.timestamp.asc()).all()
    
    return messages

@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: Session = Depends(get_db)
):
    """删除会话（无需认证）"""
    session = db.query(InterviewSession).filter(
        InterviewSession.session_id == session_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    # Delete all messages first
    db.query(SessionMessage).filter(SessionMessage.session_id == session.id).delete()
    
    # Delete session
    db.delete(session)
    db.commit()
    
    return {"detail": "Session deleted successfully"}
